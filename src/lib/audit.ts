// Audit logging + inline leak-detection rules (§8 of the plan).
// Every installer-facing access goes through logEvent(); the alert checks run
// on the hot path but are cheap indexed counts. This is deterrence +
// forensics, not prevention — the watermark is what makes a leak traceable.
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

export type Actor =
  | { userId: string; grantId?: undefined }
  | { grantId: string; userId?: undefined };

export interface LogInput {
  actor: Actor | null;
  guildId?: string | null;
  action: string;
  ip?: string | null;
  userAgent?: string | null;
  deviceFingerprint?: string | null;
  meta?: Prisma.InputJsonValue;
}

// Tunable thresholds (open item #7 — revisit once real usage volumes exist).
const RULES = {
  burstViews: { count: 10, windowMin: 10 },
  crossMake: { makes: 3, windowMin: 30 },
  repeatedDenied: { count: 3, windowMin: 15 },
};

export async function logEvent(input: LogInput): Promise<void> {
  const event = await prisma.auditEvent.create({
    data: {
      userId: input.actor?.userId ?? null,
      grantId: input.actor?.grantId ?? null,
      guildId: input.guildId ?? null,
      action: input.action,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      deviceFingerprint: input.deviceFingerprint ?? null,
      meta: input.meta,
    },
  });

  // Fire-and-forget: alert evaluation must never block or fail the view.
  evaluateAlerts(event.id, input).catch((e) =>
    console.error("alert evaluation failed", e)
  );
}

async function raiseAlert(
  rule: string,
  severity: "low" | "medium" | "high",
  input: LogInput,
  details: Prisma.InputJsonValue
) {
  // Debounce: skip if an open alert for the same rule + actor already exists.
  const existing = await prisma.alert.findFirst({
    where: {
      rule,
      status: "NEW",
      userId: input.actor?.userId ?? null,
      grantId: input.actor?.grantId ?? null,
    },
  });
  if (existing) return;
  await prisma.alert.create({
    data: {
      rule,
      severity,
      userId: input.actor?.userId ?? null,
      grantId: input.actor?.grantId ?? null,
      details,
    },
  });
}

async function evaluateAlerts(eventId: string, input: LogInput) {
  if (!input.actor) return;
  const actorWhere = input.actor.userId
    ? { userId: input.actor.userId }
    : { grantId: input.actor.grantId };
  const since = (min: number) => new Date(Date.now() - min * 60_000);

  if (input.action === "view") {
    // Rule: burst of guild views from one actor.
    const views = await prisma.auditEvent.count({
      where: {
        ...actorWhere,
        action: "view",
        ts: { gte: since(RULES.burstViews.windowMin) },
      },
    });
    if (views > RULES.burstViews.count) {
      await raiseAlert("burst_views", "high", input, {
        views,
        windowMin: RULES.burstViews.windowMin,
      });
    }

    // Rule: views across many unrelated makes in a short window.
    const recent = await prisma.auditEvent.findMany({
      where: {
        ...actorWhere,
        action: "view",
        guildId: { not: null },
        ts: { gte: since(RULES.crossMake.windowMin) },
      },
      select: { guild: { select: { makeId: true } } },
    });
    const makes = new Set(
      recent.map((r) => r.guild?.makeId).filter(Boolean)
    );
    if (makes.size > RULES.crossMake.makes) {
      await raiseAlert("cross_make", "high", input, {
        distinctMakes: makes.size,
        windowMin: RULES.crossMake.windowMin,
      });
    }

    // Rule: same grantee appearing from a new device/IP.
    if (input.ip || input.deviceFingerprint) {
      const prior = await prisma.auditEvent.findFirst({
        where: {
          ...actorWhere,
          action: "view",
          id: { not: eventId },
          NOT: [
            {
              ip: input.ip ?? undefined,
              deviceFingerprint: input.deviceFingerprint ?? undefined,
            },
          ],
        },
      });
      const everSameDevice = await prisma.auditEvent.findFirst({
        where: {
          ...actorWhere,
          action: "view",
          id: { not: eventId },
          ip: input.ip ?? undefined,
        },
      });
      if (prior && !everSameDevice) {
        await raiseAlert("new_device", "medium", input, {
          ip: input.ip,
          userAgent: input.userAgent,
        });
      }
    }
  }

  if (input.action === "denied") {
    // Rule: repeated denied/expired attempts (probing).
    const denied = await prisma.auditEvent.count({
      where: {
        ...actorWhere,
        action: "denied",
        ts: { gte: since(RULES.repeatedDenied.windowMin) },
      },
    });
    if (denied >= RULES.repeatedDenied.count) {
      await raiseAlert("repeated_denied", "medium", input, {
        denied,
        windowMin: RULES.repeatedDenied.windowMin,
      });
    }
  }

  if (input.action === "pdf_download" && input.actor.grantId) {
    // Installer-facing paths never offer PDFs — any grant-side download is abuse.
    await raiseAlert("pdf_download", "high", input, { eventId });
  }
}
