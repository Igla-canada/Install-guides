// Admin "Vehicle taxonomy" editor — the make → model → generation lists that
// feed every identity dropdown. New guides still auto-create these on the fly,
// but this is where you fix/clean them up: rename a model, edit a generation's
// years, add a new year frame, MOVE a generation onto another model (to merge a
// duplicate like "Highlander (new CAN line)" back under "Highlander"), and
// delete the empty leftovers. Everything that's referenced by a guide shows its
// guide count and is protected from deletion.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function refresh() {
  revalidatePath("/users");
  revalidatePath("/guides");
}

async function renameMake(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  try {
    await prisma.make.update({ where: { id }, data: { name } });
  } catch {
    redirect("/users?taxError=A+make+with+that+name+already+exists#taxonomy");
  }
  refresh();
  redirect("/users#taxonomy");
}

async function renameModel(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  try {
    await prisma.model.update({ where: { id }, data: { name } });
  } catch {
    redirect("/users?taxError=That+make+already+has+a+model+with+that+name#taxonomy");
  }
  refresh();
  redirect("/users#taxonomy");
}

async function addGeneration(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const modelId = String(formData.get("modelId"));
  const name = String(formData.get("name") ?? "").trim();
  const yearStart = parseInt(String(formData.get("yearStart") ?? ""), 10);
  const yearEndRaw = String(formData.get("yearEnd") ?? "").trim();
  const yearEnd = yearEndRaw ? parseInt(yearEndRaw, 10) : null;
  if (!name || Number.isNaN(yearStart)) return;
  try {
    await prisma.generation.create({
      data: { modelId, name, yearStart, yearEnd: Number.isNaN(yearEnd as number) ? null : yearEnd },
    });
  } catch {
    redirect("/users?taxError=That+model+already+has+a+generation+with+that+name#taxonomy");
  }
  refresh();
  redirect("/users#taxonomy");
}

async function updateGeneration(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const yearStart = parseInt(String(formData.get("yearStart") ?? ""), 10);
  const yearEndRaw = String(formData.get("yearEnd") ?? "").trim();
  const yearEnd = yearEndRaw ? parseInt(yearEndRaw, 10) : null;
  const data: { name?: string; yearStart?: number; yearEnd?: number | null } = {};
  if (name) data.name = name;
  if (!Number.isNaN(yearStart)) data.yearStart = yearStart;
  data.yearEnd = yearEnd !== null && Number.isNaN(yearEnd) ? null : yearEnd;
  try {
    await prisma.generation.update({ where: { id }, data });
  } catch {
    redirect("/users?taxError=That+model+already+has+a+generation+with+that+name#taxonomy");
  }
  refresh();
  redirect("/users#taxonomy");
}

// Re-parent a generation onto another model of the same make — and move every
// guide on it too, so the guide's model + generation stay consistent. This is
// how you merge an accidental duplicate model back into the real one.
async function moveGeneration(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const targetModelId = String(formData.get("targetModelId") ?? "");
  if (!targetModelId) return;
  try {
    await prisma.$transaction([
      prisma.guild.updateMany({ where: { generationId: id }, data: { modelId: targetModelId } }),
      prisma.generation.update({ where: { id }, data: { modelId: targetModelId } }),
    ]);
  } catch {
    redirect("/users?taxError=The+target+model+already+has+a+generation+with+that+name+-+rename+first#taxonomy");
  }
  refresh();
  redirect("/users#taxonomy");
}

async function deleteGeneration(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const guilds = await prisma.guild.count({ where: { generationId: id } });
  if (guilds > 0) return; // protected — guides still use it
  await prisma.generation.delete({ where: { id } }).catch(() => null);
  refresh();
  redirect("/users#taxonomy");
}

async function deleteModel(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const [gens, guilds] = await Promise.all([
    prisma.generation.count({ where: { modelId: id } }),
    prisma.guild.count({ where: { modelId: id } }),
  ]);
  if (gens > 0 || guilds > 0) return; // only empty models can be removed
  await prisma.model.delete({ where: { id } }).catch(() => null);
  refresh();
  redirect("/users#taxonomy");
}

const fieldCls = "rounded-md border border-zinc-300 px-2 py-1 text-sm";

export default async function TaxonomyManager({ error }: { error?: string }) {
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
            include: { _count: { select: { guilds: true } } },
          },
        },
      },
    },
  });

  return (
    <div id="taxonomy" className="mt-10 rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Vehicle taxonomy (dropdown lists)</h2>
      <p className="mt-1 text-xs text-zinc-400">
        The make → model → generation options behind the identity dropdowns.
        Rename a model, edit a generation’s years, add a new year frame, or move
        a generation onto another model to merge a duplicate. Anything a guide
        uses shows its count and can’t be deleted until those guides move off it.
      </p>
      {error && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-3 space-y-1">
        {makes.map((mk) => (
          <details key={mk.id} className="rounded-lg border border-zinc-200">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              {mk.name}{" "}
              <span className="text-xs font-normal text-zinc-400">
                ({mk.models.length} model{mk.models.length === 1 ? "" : "s"})
              </span>
            </summary>

            <div className="space-y-3 border-t border-zinc-100 p-3">
              <form action={renameMake} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={mk.id} />
                <span className="text-xs text-zinc-400">Make name</span>
                <input name="name" defaultValue={mk.name} className={`${fieldCls} w-48`} />
                <button className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
                  Rename
                </button>
              </form>

              {mk.models.map((md) => {
                const siblings = mk.models.filter((x) => x.id !== md.id);
                const modelEmpty = md.generations.length === 0 && md._count.guilds === 0;
                return (
                  <div key={md.id} className="rounded-md border border-zinc-200 p-2">
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
                        <span className="ml-auto text-xs text-zinc-400">{md._count.guilds} guide(s)</span>
                      )}
                    </div>

                    <div className="mt-2 space-y-2">
                      {md.generations.map((g) => (
                        <div key={g.id} className="rounded border border-zinc-100 bg-zinc-50 p-2">
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
                            <span className="text-[11px] text-zinc-400">{g._count.guilds} guide(s)</span>
                          </form>

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
                      ))}

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
        ))}
      </div>
    </div>
  );
}
