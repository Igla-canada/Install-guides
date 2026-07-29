// Admin "Vehicle taxonomy" editor — the make → model → generation lists that
// feed every identity dropdown. New guides still auto-create these on the fly,
// but this is where you fix/clean them up: rename a model, edit a generation's
// years, add a new year frame, MOVE a generation onto another model (to merge a
// duplicate like "Highlander (new CAN line)" back under "Highlander"), and
// delete the empty leftovers. Everything that's referenced by a guide shows its
// guide count and is protected from deletion.
//
// After every save we redirect back with ?make=&model=&gen= so the make panel
// stays open, the working row scrolls into view, and success/error shows inline
// — not a collapsed list you have to hunt through again.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import TaxonomyFocus from "@/components/admin/taxonomy-focus";
import TaxonomyGuideChips from "@/components/admin/taxonomy-guide-chips";
import {
  syncCompatibilityForGeneration,
  syncCompatibilityForMake,
  syncCompatibilityForModel,
} from "@/lib/vehicle-compatibility";

function refresh() {
  revalidatePath("/users");
  revalidatePath("/guides");
  revalidatePath("/compatibility");
  revalidatePath("/dealer/compatibility");
}

function taxUrl(opts: {
  make?: string | null;
  model?: string | null;
  gen?: string | null;
  ok?: string;
  error?: string;
}) {
  const p = new URLSearchParams({ tab: "taxonomy" });
  if (opts.make) p.set("make", opts.make);
  if (opts.model) p.set("model", opts.model);
  if (opts.gen) p.set("gen", opts.gen);
  if (opts.ok) p.set("taxOk", opts.ok);
  if (opts.error) p.set("taxError", opts.error);
  return `/users?${p.toString()}`;
}

async function renameMake(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(taxUrl({ make: id, error: "Make name can’t be empty" }));
  }
  try {
    await prisma.make.update({ where: { id }, data: { name } });
  } catch {
    redirect(taxUrl({ make: id, error: "A make with that name already exists" }));
  }
  await syncCompatibilityForMake(id);
  refresh();
  redirect(taxUrl({ make: id, ok: "Make renamed" }));
}

async function deleteMake(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  // Only an empty make can go: no models, no guilds, and not a secondary make
  // bridged from any guide.
  const [models, guilds, bridges] = await Promise.all([
    prisma.model.count({ where: { makeId: id } }),
    prisma.guild.count({ where: { makeId: id } }),
    prisma.guildMake.count({ where: { makeId: id } }),
  ]);
  if (models > 0 || guilds > 0 || bridges > 0) {
    redirect(
      taxUrl({
        make: id,
        error: "Remove everything under this make first (models and bridged guides)",
      })
    );
  }
  const ok = await prisma.make
    .delete({ where: { id } })
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    redirect(taxUrl({ make: id, error: "Could not delete this make" }));
  }
  refresh();
  redirect(taxUrl({ ok: "Empty make deleted" }));
}

async function renameModel(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const row = await prisma.model.findUnique({
    where: { id },
    select: { makeId: true },
  });
  if (!row) redirect(taxUrl({ error: "Model not found" }));
  if (!name) {
    redirect(taxUrl({ make: row.makeId, model: id, error: "Model name can’t be empty" }));
  }
  try {
    await prisma.model.update({ where: { id }, data: { name } });
  } catch {
    redirect(
      taxUrl({
        make: row.makeId,
        model: id,
        error: "That make already has a model with that name",
      })
    );
  }
  await syncCompatibilityForModel(id);
  refresh();
  redirect(taxUrl({ make: row.makeId, model: id, ok: "Model renamed" }));
}

async function addGeneration(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const modelId = String(formData.get("modelId"));
  const name = String(formData.get("name") ?? "").trim();
  const yearStart = parseInt(String(formData.get("yearStart") ?? ""), 10);
  const yearEndRaw = String(formData.get("yearEnd") ?? "").trim();
  const yearEnd = yearEndRaw ? parseInt(yearEndRaw, 10) : null;
  const model = await prisma.model.findUnique({
    where: { id: modelId },
    select: { makeId: true },
  });
  if (!model) redirect(taxUrl({ error: "Model not found" }));
  if (!name || Number.isNaN(yearStart)) {
    redirect(
      taxUrl({
        make: model.makeId,
        model: modelId,
        error: "New generation needs a label and a start year",
      })
    );
  }
  try {
    const created = await prisma.generation.create({
      data: {
        modelId,
        name,
        yearStart,
        yearEnd: Number.isNaN(yearEnd as number) ? null : yearEnd,
      },
    });
    refresh();
    redirect(
      taxUrl({
        make: model.makeId,
        model: modelId,
        gen: created.id,
        ok: "Year frame added",
      })
    );
  } catch {
    redirect(
      taxUrl({
        make: model.makeId,
        model: modelId,
        error: "That model already has a generation with that name",
      })
    );
  }
}

async function updateGeneration(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const yearStart = parseInt(String(formData.get("yearStart") ?? ""), 10);
  const yearEndRaw = String(formData.get("yearEnd") ?? "").trim();
  const yearEnd = yearEndRaw ? parseInt(yearEndRaw, 10) : null;
  const row = await prisma.generation.findUnique({
    where: { id },
    select: { modelId: true, model: { select: { makeId: true } } },
  });
  if (!row) redirect(taxUrl({ error: "Generation not found" }));
  const ctx = { make: row.model.makeId, model: row.modelId, gen: id };
  const data: { name?: string; yearStart?: number; yearEnd?: number | null } = {};
  if (name) data.name = name;
  if (!Number.isNaN(yearStart)) data.yearStart = yearStart;
  data.yearEnd = yearEnd !== null && Number.isNaN(yearEnd) ? null : yearEnd;
  try {
    await prisma.generation.update({ where: { id }, data });
  } catch {
    redirect(taxUrl({ ...ctx, error: "That model already has a generation with that name" }));
  }
  await syncCompatibilityForGeneration(id);
  refresh();
  redirect(taxUrl({ ...ctx, ok: "Saved label / years" }));
}

// Re-parent a generation onto another model of the same make — and move every
// guide on it too, so the guide's model + generation stay consistent. This is
// how you merge an accidental duplicate model back into the real one.
async function moveGeneration(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const targetModelId = String(formData.get("targetModelId") ?? "");
  const row = await prisma.generation.findUnique({
    where: { id },
    select: {
      name: true,
      modelId: true,
      model: { select: { makeId: true, name: true } },
    },
  });
  if (!row) redirect(taxUrl({ error: "Generation not found" }));
  const fromCtx = { make: row.model.makeId, model: row.modelId, gen: id };
  if (!targetModelId) {
    redirect(taxUrl({ ...fromCtx, error: "Pick a target model first" }));
  }
  const target = await prisma.model.findUnique({
    where: { id: targetModelId },
    select: { id: true, name: true, makeId: true },
  });
  if (!target || target.makeId !== row.model.makeId) {
    redirect(taxUrl({ ...fromCtx, error: "Target model must be under the same make" }));
  }
  try {
    await prisma.$transaction([
      prisma.guild.updateMany({ where: { generationId: id }, data: { modelId: targetModelId } }),
      prisma.generation.update({ where: { id }, data: { modelId: targetModelId } }),
    ]);
  } catch {
    redirect(
      taxUrl({
        ...fromCtx,
        error: "The target model already has a generation with that name — rename first",
      })
    );
  }
  await syncCompatibilityForGeneration(id);
  refresh();
  // Land on the destination model so you can see the move without hunting.
  redirect(
    taxUrl({
      make: target.makeId,
      model: target.id,
      gen: id,
      ok: `Moved “${row.name}” to ${target.name}`,
    })
  );
}

async function deleteGeneration(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const row = await prisma.generation.findUnique({
    where: { id },
    select: { modelId: true, model: { select: { makeId: true } } },
  });
  if (!row) redirect(taxUrl({ error: "Generation not found" }));
  const ctx = { make: row.model.makeId, model: row.modelId };
  const guilds = await prisma.guild.count({ where: { generationId: id } });
  if (guilds > 0) {
    redirect(
      taxUrl({
        ...ctx,
        gen: id,
        error: `Can’t delete — ${guilds} guide(s) still use this generation`,
      })
    );
  }
  await prisma.generation.delete({ where: { id } }).catch(() => null);
  refresh();
  redirect(taxUrl({ ...ctx, ok: "Generation deleted" }));
}

async function deleteModel(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const row = await prisma.model.findUnique({
    where: { id },
    select: { makeId: true },
  });
  if (!row) redirect(taxUrl({ error: "Model not found" }));
  const [gens, guilds] = await Promise.all([
    prisma.generation.count({ where: { modelId: id } }),
    prisma.guild.count({ where: { modelId: id } }),
  ]);
  if (gens > 0 || guilds > 0) {
    redirect(
      taxUrl({
        make: row.makeId,
        model: id,
        error: "Can’t delete — remove generations / move guides off this model first",
      })
    );
  }
  await prisma.model.delete({ where: { id } }).catch(() => null);
  refresh();
  redirect(taxUrl({ make: row.makeId, ok: "Empty model deleted" }));
}

const fieldCls = "rounded-md border border-zinc-300 px-2 py-1 text-sm";

// Per-generation accent colours so each generation's guides are visually grouped.
const GEN_COLORS = ["#2563eb", "#16a34a", "#a855f7", "#ea580c", "#0891b2", "#db2777"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) {
    return (
      <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (ok) {
    return (
      <div className="mt-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
        {ok}
      </div>
    );
  }
  return null;
}

export default async function TaxonomyManager({
  error,
  ok,
  openMake,
  openModel,
  openGen,
}: {
  error?: string;
  ok?: string;
  openMake?: string;
  openModel?: string;
  openGen?: string;
}) {
  await requireRole("ADMIN");
  const makes = await prisma.make.findMany({
    orderBy: { name: "asc" },
    include: {
      models: {
        orderBy: { name: "asc" },
        include: {
          _count: { select: { guilds: true } },
          generations: {
            orderBy: { yearStart: "asc" },
            include: {
              _count: { select: { guilds: true } },
              // The actual guides on this generation, so the admin can open each
              // one to see what it is before renaming/moving/deleting. Their alt
              // model names let us ghost a shared guide onto its sibling
              // generations (e.g. one "Range Rover" guide that also answers to
              // "Evoque", "Velar", …).
              // Live guides only in the UI (archived stay in _count for
              // delete protection but are hidden here — less noise).
              guilds: {
                where: { status: { not: "ARCHIVED" } },
                select: {
                  id: true,
                  title: true,
                  status: true,
                  hideFromCompatibility: true,
                  altModelAliases: { select: { name: true } },
                },
                orderBy: { title: "asc" },
              },
            },
          },
        },
      },
      // Guides whose PRIMARY make is elsewhere but that are bridged to this make
      // (secondary make). Shown as read-only "shadows" so the admin sees the
      // vehicle exists under this make too, without it being a real taxonomy row.
      altGuilds: {
        where: { guild: { status: { not: "ARCHIVED" } } },
        include: {
          guild: {
            select: {
              id: true,
              title: true,
              status: true,
              hideFromCompatibility: true,
              make: { select: { name: true } },
              model: { select: { name: true } },
              generation: { select: { name: true } },
              altModelAliases: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  // If a flash has no make (e.g. deleted make), show it at the top.
  const topFlash =
    (ok || error) &&
    !openMake &&
    !openModel &&
    !openGen;

  return (
    <div id="taxonomy" className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
      <TaxonomyFocus modelId={openModel} genId={openGen} />
      <h2 className="text-sm font-semibold">Vehicle taxonomy (dropdown lists)</h2>
      <p className="mt-1 text-xs text-zinc-400">
        The make → model → generation options behind the identity dropdowns.
        Rename a model, edit a generation’s years, add a new year frame, or move
        a generation onto another model to merge a duplicate. Archived guides are
        hidden here. Tap a guide to preview it on this page (same as Guides list);
        use Edit only when you need to change it. After Save / Move, this panel
        stays open on the row you were editing.
      </p>
      {topFlash && <Flash ok={ok} error={error} />}

      <div className="mt-3 space-y-1">
        {makes.map((mk) => {
          const makeOpen = openMake === mk.id;
          const makeFlash = makeOpen && !openModel && !openGen;
          return (
          <details
            key={mk.id}
            className="rounded-lg border border-zinc-200"
            {...(makeOpen ? { open: true } : {})}
          >
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              {mk.name}{" "}
              <span className="text-xs font-normal text-zinc-400">
                ({mk.models.length} model{mk.models.length === 1 ? "" : "s"}
                {mk.altGuilds.length > 0 && `, ${mk.altGuilds.length} bridged`})
              </span>
            </summary>

            <div className="space-y-3 border-t border-zinc-100 p-3">
              {makeFlash && <Flash ok={ok} error={error} />}
              <div className="flex flex-wrap items-center gap-2">
                <form action={renameMake} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={mk.id} />
                  <span className="text-xs text-zinc-400">Make name</span>
                  <input name="name" defaultValue={mk.name} className={`${fieldCls} w-48`} />
                  <button className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
                    Rename
                  </button>
                </form>
                {mk.models.length === 0 && mk.altGuilds.length === 0 && (
                  <form action={deleteMake} className="ml-auto">
                    <input type="hidden" name="id" value={mk.id} />
                    <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                      Delete empty make
                    </button>
                  </form>
                )}
              </div>

              {/* Shadow rows: guides whose primary make is elsewhere but that are
                  bridged to this make (RAM 1500 → Dodge). Read-only — edit them
                  from their real make. */}
              {mk.altGuilds.length > 0 && (
                <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-2">
                  <div className="text-[11px] font-medium text-zinc-500">
                    Bridged from other makes — these guides also match “{mk.name}”
                  </div>
                  <TaxonomyGuideChips
                    label=""
                    ghost
                    guides={mk.altGuilds.map((b) => {
                      const g = b.guild;
                      const label = g.altModelAliases[0]?.name ?? g.model.name;
                      return {
                        id: g.id,
                        title: label,
                        status: g.status,
                        hideFromCompatibility: g.hideFromCompatibility,
                        subtitle: `${g.make.name} › ${g.model.name} · ${g.generation.name}`,
                        note: `(from ${g.make.name} › ${g.model.name})`,
                      };
                    })}
                  />
                </div>
              )}

              {mk.models.map((md) => {
                const siblings = mk.models.filter((x) => x.id !== md.id);
                const modelEmpty = md.generations.length === 0 && md._count.guilds === 0;
                // Every guide under this model with its home generation + the
                // model names it also answers to — used to ghost a shared guide
                // onto the sibling generations it covers via those alt names.
                const modelGuilds = md.generations.flatMap((gen) =>
                  gen.guilds.map((gd) => ({
                    id: gd.id,
                    title: gd.title,
                    status: gd.status,
                    hideFromCompatibility: gd.hideFromCompatibility,
                    genId: gen.id,
                    genName: gen.name,
                    altNames: gd.altModelAliases.map((a) => norm(a.name)),
                  }))
                );
                const liveGuideCount = md.generations.reduce(
                  (n, gen) => n + gen.guilds.length,
                  0
                );
                const modelFlash =
                  openModel === md.id && !openGen && (ok || error);
                return (
                  <div
                    key={md.id}
                    id={`tax-model-${md.id}`}
                    className={`rounded-md border p-2 ${
                      openModel === md.id
                        ? "border-amber-400 ring-1 ring-amber-200"
                        : "border-zinc-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={renameModel} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={md.id} />
                        <input name="name" defaultValue={md.name} className={`${fieldCls} w-52 font-medium`} />
                        <button className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
                          Rename
                        </button>
                      </form>
                      {modelEmpty ? (
                        <form action={deleteModel} className="ml-auto">
                          <input type="hidden" name="id" value={md.id} />
                          <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                            Delete empty model
                          </button>
                        </form>
                      ) : (
                        <span className="ml-auto text-xs text-zinc-400">
                          {liveGuideCount} guide{liveGuideCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    {modelFlash && <Flash ok={ok} error={error} />}

                    <div className="mt-2 space-y-2">
                      {md.generations.map((g, gi) => {
                        // Colour-band each generation so its guides are visually
                        // grouped; flag generations shared by 2+ guides (editing
                        // their years/label affects every guide on them).
                        const color = GEN_COLORS[gi % GEN_COLORS.length];
                        const liveCount = g.guilds.length;
                        const shared = liveCount > 1;
                        // Guides that live on ANOTHER generation of this model but
                        // also answer to this generation's label via an alt model
                        // name — shown here as read-only ghosts.
                        const ghosts = modelGuilds.filter(
                          (gd) => gd.genId !== g.id && gd.altNames.includes(norm(g.name))
                        );
                        const genFlash = openGen === g.id && (ok || error);
                        return (
                        <div
                          key={g.id}
                          id={`tax-gen-${g.id}`}
                          className={`rounded border border-l-4 bg-zinc-50 p-2 ${
                            openGen === g.id
                              ? "border-amber-400 ring-1 ring-amber-200"
                              : "border-zinc-100"
                          }`}
                          style={{ borderLeftColor: color }}
                        >
                          <form action={updateGeneration} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="id" value={g.id} />
                            <label className="flex flex-col text-[11px] text-zinc-500">
                              Label
                              <input name="name" defaultValue={g.name} className={`${fieldCls} mt-0.5 w-44`} />
                            </label>
                            <label className="flex flex-col text-[11px] text-zinc-500">
                              From
                              <input name="yearStart" type="number" defaultValue={g.yearStart} className={`${fieldCls} mt-0.5 w-20`} />
                            </label>
                            <label className="flex flex-col text-[11px] text-zinc-500">
                              To
                              <input name="yearEnd" type="number" defaultValue={g.yearEnd ?? ""} placeholder="now" className={`${fieldCls} mt-0.5 w-20`} />
                            </label>
                            <button className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
                              Save
                            </button>
                            <span className="text-[11px] text-zinc-400">
                              {liveCount} guide{liveCount === 1 ? "" : "s"}
                            </span>
                            {shared && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                ⚠ {liveCount} guides share this — editing affects both
                              </span>
                            )}
                          </form>
                          {genFlash && <Flash ok={ok} error={error} />}

                          <TaxonomyGuideChips
                            label="Guides:"
                            accentColor={color}
                            guides={g.guilds.map((gd) => ({
                              id: gd.id,
                              title: gd.title,
                              status: gd.status,
                              hideFromCompatibility: gd.hideFromCompatibility,
                              subtitle: `${mk.name} ${md.name} · ${g.name}`,
                            }))}
                          />

                          {/* The extra model names each guide here was given, so
                              the coverage of a guide is visible from the taxonomy
                              without opening it. These are the names the resolver
                              serves the guide under, on top of its own model. */}
                          {g.guilds
                            .filter((gd) => gd.altModelAliases.length > 0)
                            .map((gd) => (
                              <p key={`alias-${gd.id}`} className="mt-1 text-[11px] text-zinc-500">
                                <span className="text-zinc-400">
                                  {g.guilds.length > 1 ? `${gd.title.trim()} — ` : ""}
                                  also serves under:
                                </span>{" "}
                                {gd.altModelAliases.map((a) => (
                                  <span
                                    key={a.name}
                                    className="mr-1 inline-block rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-zinc-700"
                                  >
                                    {a.name}
                                  </span>
                                ))}
                              </p>
                            ))}

                          <TaxonomyGuideChips
                            label="Also (ghost):"
                            ghost
                            guides={ghosts.map((gd) => ({
                              id: gd.id,
                              title: gd.title,
                              status: gd.status,
                              hideFromCompatibility: gd.hideFromCompatibility,
                              subtitle: `${mk.name} ${md.name} · ${gd.genName}`,
                              note: `(from ${gd.genName})`,
                            }))}
                          />

                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {siblings.length > 0 && (
                              <form action={moveGeneration} className="flex items-center gap-1">
                                <input type="hidden" name="id" value={g.id} />
                                <span className="text-[11px] text-zinc-400">Move to</span>
                                <select name="targetModelId" className={`${fieldCls} py-0.5 text-xs`} defaultValue="">
                                  <option value="" disabled>
                                    another model…
                                  </option>
                                  {siblings.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                                <button className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100">
                                  Move
                                </button>
                              </form>
                            )}
                            {g._count.guilds === 0 && (
                              <form action={deleteGeneration}>
                                <input type="hidden" name="id" value={g.id} />
                                <button className="rounded-md border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">
                                  Delete
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                        );
                      })}

                      <form action={addGeneration} className="flex flex-wrap items-end gap-2 border-t border-dashed border-zinc-200 pt-2">
                        <input type="hidden" name="modelId" value={md.id} />
                        <label className="flex flex-col text-[11px] text-zinc-500">
                          New generation
                          <input name="name" placeholder="e.g. 2024 new CAN line" className={`${fieldCls} mt-0.5 w-44`} />
                        </label>
                        <label className="flex flex-col text-[11px] text-zinc-500">
                          From
                          <input name="yearStart" type="number" placeholder="2024" className={`${fieldCls} mt-0.5 w-20`} />
                        </label>
                        <label className="flex flex-col text-[11px] text-zinc-500">
                          To
                          <input name="yearEnd" type="number" placeholder="now" className={`${fieldCls} mt-0.5 w-20`} />
                        </label>
                        <button className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
                          Add year frame
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
          );
        })}
      </div>
    </div>
  );
}
