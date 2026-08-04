"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requestMeta } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/audit";
import { publishGuild, PublishConflictError } from "@/lib/guild-doc";
import { syncCompatibilityFromGuide } from "@/lib/vehicle-compatibility";

export type GuideListActionResult =
  | { ok: true; status: string }
  | { ok: false; error: string; conflictTitle?: string };

/** Hide a guide from the normal library (keeps content as backup). */
export async function archiveGuide(guildId: string): Promise<GuideListActionResult> {
  const u = await requireRole("ADMIN", "TECH");
  const g = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!g) return { ok: false, error: "not_found" };
  if (g.status === "ARCHIVED") return { ok: true, status: "ARCHIVED" };

  await prisma.guild.update({
    where: { id: guildId },
    data: { status: "ARCHIVED", updatedById: u.id },
  });
  await syncCompatibilityFromGuide(guildId);
  const meta = await requestMeta();
  await logEvent({
    actor: { userId: u.id },
    guildId,
    action: "guild_archived",
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  revalidatePath("/guides");
  revalidatePath("/compatibility");
  revalidatePath("/dealer/compatibility");
  return { ok: true, status: "ARCHIVED" };
}

/** Bring an archived guide back as a draft (or leave draft/published as-is). */
export async function restoreGuide(guildId: string): Promise<GuideListActionResult> {
  const u = await requireRole("ADMIN", "TECH");
  const g = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!g) return { ok: false, error: "not_found" };
  if (g.status !== "ARCHIVED") return { ok: true, status: g.status };

  await prisma.guild.update({
    where: { id: guildId },
    data: { status: "DRAFT", updatedById: u.id },
  });
  await syncCompatibilityFromGuide(guildId);
  const meta = await requestMeta();
  await logEvent({
    actor: { userId: u.id },
    guildId,
    action: "guild_restored",
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  revalidatePath("/guides");
  revalidatePath("/compatibility");
  revalidatePath("/dealer/compatibility");
  return { ok: true, status: "DRAFT" };
}

/**
 * Hide (or show) this guide on the dealer/API compatibility list.
 * Takes priority over published status — archived still hides either way.
 */
export async function setHideFromCompatibility(
  guildId: string,
  hide: boolean,
): Promise<{ ok: true; hideFromCompatibility: boolean } | { ok: false; error: string }> {
  const u = await requireRole("ADMIN", "TECH");
  const g = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!g) return { ok: false, error: "not_found" };

  await prisma.guild.update({
    where: { id: guildId },
    data: { hideFromCompatibility: hide, updatedById: u.id },
  });
  const meta = await requestMeta();
  await logEvent({
    actor: { userId: u.id },
    guildId,
    action: hide
      ? "guild_hidden_from_compatibility"
      : "guild_shown_on_compatibility",
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  revalidatePath("/guides");
  revalidatePath(`/guides/${guildId}`);
  revalidatePath(`/guides/${guildId}/edit`);
  revalidatePath("/dealer/compatibility");
  revalidatePath("/compatibility");
  return { ok: true, hideFromCompatibility: hide };
}

/** Guide checkbox → linked compatibility Analog column (never creates/deletes guides). */
export async function setAnalogBlockingRequired(
  guildId: string,
  required: boolean,
): Promise<
  | { ok: true; analogBlockingRequired: boolean; syncedRows: number }
  | { ok: false; error: string }
> {
  const u = await requireRole("ADMIN", "TECH");
  const g = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!g) return { ok: false, error: "not_found" };

  await prisma.guild.update({
    where: { id: guildId },
    data: { analogBlockingRequired: required, updatedById: u.id },
  });

  const { syncCompatibilityFromGuide } = await import(
    "@/lib/vehicle-compatibility"
  );
  const syncedRows = await syncCompatibilityFromGuide(guildId);

  const meta = await requestMeta();
  await logEvent({
    actor: { userId: u.id },
    guildId,
    action: required
      ? "guild_analog_blocking_on"
      : "guild_analog_blocking_off",
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { syncedRows },
  });
  revalidatePath("/guides");
  revalidatePath(`/guides/${guildId}`);
  revalidatePath(`/guides/${guildId}/edit`);
  revalidatePath("/dealer/compatibility");
  revalidatePath("/compatibility");
  revalidatePath("/users");
  return { ok: true, analogBlockingRequired: required, syncedRows };
}

/** Publish from the floating preview / list without opening the full editor. */
export async function quickPublishGuide(
  guildId: string,
): Promise<GuideListActionResult> {
  const u = await requireRole("ADMIN", "TECH");
  try {
    await publishGuild(guildId, u.id);
  } catch (e) {
    if (e instanceof PublishConflictError) {
      return {
        ok: false,
        error: "conflict",
        conflictTitle: e.conflictingTitle,
      };
    }
    throw e;
  }
  const meta = await requestMeta();
  await logEvent({
    actor: { userId: u.id },
    guildId,
    action: "guild_published",
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { via: "quick_preview" },
  });
  revalidatePath("/guides");
  return { ok: true, status: "PUBLISHED" };
}

export type DeleteGuideResult =
  | { ok: true; deleted: true }
  | { ok: false; error: string };

/**
 * Hard delete — admin only, irreversible (sections, versions, grant links go
 * with it; audit events are kept with the guild reference nulled). Prefer
 * archive when the guide might be needed again.
 */
export async function deleteGuidePermanently(
  guildId: string,
): Promise<DeleteGuideResult> {
  const u = await requireRole("ADMIN");
  const g = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!g) return { ok: false, error: "not_found" };

  const meta = await requestMeta();
  await logEvent({
    actor: { userId: u.id },
    action: "guild_deleted",
    ip: meta.ip,
    userAgent: meta.userAgent,
    meta: { guildId, title: g.title },
  });
  await prisma.guild.delete({ where: { id: guildId } });
  // Drop the mirrored compatibility row too. There's no FK (the mirror must
  // never control guides), so without this the row is orphaned: it can never
  // resync, yet keeps showing dealers a vehicle with a frozen status and no
  // guide behind it.
  await prisma.vehicleCompatibility
    .deleteMany({ where: { sourceGuideId: guildId } })
    .catch(() => null);
  revalidatePath("/guides");
  revalidatePath("/compatibility");
  revalidatePath("/dealer/compatibility");
  return { ok: true, deleted: true };
}
