import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  addAlias,
  addGeneration,
  addInventoryUnit,
  addMake,
  addModel,
  addProduct,
  addTrim,
  deleteEntity,
} from "./actions";

export default async function TaxonomyPage(props: {
  searchParams: Promise<{ make?: string; model?: string; gen?: string }>;
}) {
  const user = await requireRole("ADMIN", "TECH");
  const sp = await props.searchParams;

  const makes = await prisma.make.findMany({ orderBy: { name: "asc" } });
  const selMake = sp.make ? makes.find((m) => m.id === sp.make) : undefined;
  const models = selMake
    ? await prisma.model.findMany({
        where: { makeId: selMake.id },
        orderBy: { name: "asc" },
      })
    : [];
  const selModel = sp.model ? models.find((m) => m.id === sp.model) : undefined;
  const generations = selModel
    ? await prisma.generation.findMany({
        where: { modelId: selModel.id },
        orderBy: { yearStart: "asc" },
        include: { trims: { orderBy: { name: "asc" } } },
      })
    : [];
  const aliases = selMake
    ? await prisma.vehicleAlias.findMany({
        where: { makeId: selMake.id },
        include: { model: true },
        orderBy: { aliasText: "asc" },
      })
    : [];
  const productLines = await prisma.productLine.findMany({
    orderBy: { name: "asc" },
    include: { products: { orderBy: { name: "asc" } } },
  });
  const inventory = await prisma.inventoryUnit.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { iglaProduct: { include: { productLine: true } } },
  });
  const isAdmin = user.role === "ADMIN";

  const qs = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { make: sp.make, model: sp.model, gen: sp.gen, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/taxonomy?${p}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">Taxonomy</h1>
      <p className="mt-1 text-sm text-zinc-500">
        The controlled vocabulary behind guild identity and the Igla app&apos;s
        automatic guide lookup. Keep it curated — identity is never free text.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Makes */}
        <Panel title={`Makes (${makes.length})`}>
          <ul className="max-h-72 overflow-y-auto">
            {makes.map((m) => (
              <li key={m.id} className="flex items-center">
                <Link
                  href={qs({ make: m.id, model: undefined, gen: undefined })}
                  className={`flex-1 rounded px-2 py-1 text-sm hover:bg-zinc-100 ${
                    selMake?.id === m.id ? "bg-zinc-900 text-white hover:bg-zinc-800" : ""
                  }`}
                >
                  {m.name}
                </Link>
                {isAdmin && <DeleteBtn kind="make" id={m.id} />}
              </li>
            ))}
          </ul>
          <AddForm action={addMake} fields={[{ name: "name", placeholder: "Add make…" }]} />
        </Panel>

        {/* Models */}
        <Panel title={selMake ? `${selMake.name} models` : "Models"}>
          {!selMake ? (
            <Empty>Select a make</Empty>
          ) : (
            <>
              <ul className="max-h-72 overflow-y-auto">
                {models.map((m) => (
                  <li key={m.id} className="flex items-center">
                    <Link
                      href={qs({ model: m.id, gen: undefined })}
                      className={`flex-1 rounded px-2 py-1 text-sm hover:bg-zinc-100 ${
                        selModel?.id === m.id ? "bg-zinc-900 text-white hover:bg-zinc-800" : ""
                      }`}
                    >
                      {m.name}
                    </Link>
                    {isAdmin && <DeleteBtn kind="model" id={m.id} />}
                  </li>
                ))}
              </ul>
              <AddForm
                action={addModel}
                hidden={{ makeId: selMake.id }}
                fields={[{ name: "name", placeholder: "Add model…" }]}
              />
            </>
          )}
        </Panel>

        {/* Generations + trims */}
        <Panel title={selModel ? `${selModel.name} generations` : "Generations & trims"}>
          {!selModel ? (
            <Empty>Select a model</Empty>
          ) : (
            <>
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {generations.map((g) => (
                  <li key={g.id} className="rounded-md border border-zinc-100 p-2">
                    <div className="flex items-center text-sm font-medium">
                      {g.name}
                      <span className="ml-2 text-xs font-normal text-zinc-400">
                        {g.yearStart}–{g.yearEnd ?? "now"}
                      </span>
                      {isAdmin && <DeleteBtn kind="generation" id={g.id} />}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {g.trims.map((t) => (
                        <span
                          key={t.id}
                          className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs"
                        >
                          {t.name}
                          {isAdmin && <DeleteBtn kind="trim" id={t.id} small />}
                        </span>
                      ))}
                      <AddForm
                        action={addTrim}
                        inline
                        hidden={{ generationId: g.id }}
                        fields={[{ name: "name", placeholder: "+ trim", small: true }]}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <AddForm
                action={addGeneration}
                hidden={{ modelId: selModel.id }}
                fields={[
                  { name: "name", placeholder: "Generation (e.g. II (G22))" },
                  { name: "yearStart", placeholder: "From year", type: "number" },
                  { name: "yearEnd", placeholder: "To year (blank = now)", type: "number", optional: true },
                ]}
              />
            </>
          )}
        </Panel>
      </div>

      {/* Aliases */}
      {selMake && (
        <Panel title={`Free-text aliases for ${selMake.name}`} className="mt-4">
          <p className="text-xs text-zinc-400">
            The Igla portal sends make/model as free text. Aliases map common
            spellings/typos to this taxonomy — e.g. “vw” → Volkswagen, “4-series” → 4 Series.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {aliases.map((a) => (
              <span key={a.id} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
                “{a.aliasText}” → {a.model ? a.model.name : selMake.name}
                {isAdmin && <DeleteBtn kind="alias" id={a.id} small />}
              </span>
            ))}
          </div>
          <form action={addAlias} className="mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="makeId" value={selMake.id} />
            <input
              name="aliasText"
              required
              placeholder="alias text (e.g. 4-series)"
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
            />
            <select name="modelId" className="rounded-md border border-zinc-300 px-2 py-1 text-sm">
              <option value="">(maps to the make itself)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  → {m.name}
                </option>
              ))}
            </select>
            <button className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100">
              Add alias
            </button>
          </form>
        </Panel>
      )}

      {/* Products + inventory */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Igla products">
          {productLines.map((pl) => (
            <div key={pl.id} className="mb-2">
              <div className="text-sm font-medium">{pl.name}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {pl.products.map((p) => (
                  <span key={p.id} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
                    {p.name}
                    {p.modelCode && <span className="text-zinc-400">({p.modelCode})</span>}
                    {isAdmin && <DeleteBtn kind="product" id={p.id} small />}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <form action={addProduct} className="mt-2 flex flex-wrap gap-2">
            <select name="productLineId" required className="rounded-md border border-zinc-300 px-2 py-1 text-sm">
              {productLines.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name}
                </option>
              ))}
            </select>
            <input name="name" required placeholder="Product name" className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <input name="modelCode" placeholder="Model code (optional)" className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <button className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100">
              Add product
            </button>
          </form>
        </Panel>

        <Panel title="Inventory units (serial → product)">
          <p className="text-xs text-zinc-400">
            Used by the resolve API to identify the product from the unit serial
            the installer scans. Replace with the Igla portal inventory API when
            available (src/lib/inventory.ts).
          </p>
          <ul className="mt-2 max-h-56 overflow-y-auto text-sm">
            {inventory.map((u) => (
              <li key={u.id} className="flex items-center border-b border-zinc-50 py-1">
                <span className="font-mono text-xs">{u.serial}</span>
                <span className="ml-2 text-zinc-500">
                  → {u.iglaProduct.productLine.name} {u.iglaProduct.name}
                </span>
                {isAdmin && <DeleteBtn kind="inventory" id={u.id} />}
              </li>
            ))}
          </ul>
          <form action={addInventoryUnit} className="mt-2 flex flex-wrap gap-2">
            <input name="serial" required placeholder="Unit serial" className="rounded-md border border-zinc-300 px-2 py-1 text-sm" />
            <select name="iglaProductId" required className="rounded-md border border-zinc-300 px-2 py-1 text-sm">
              {productLines.flatMap((pl) =>
                pl.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {pl.name} — {p.name}
                  </option>
                ))
              )}
            </select>
            <button className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100">
              Add unit
            </button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-4 ${className}`}>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-zinc-400">{children}</p>;
}

function AddForm({
  action,
  fields,
  hidden = {},
  inline = false,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Array<{ name: string; placeholder: string; type?: string; optional?: boolean; small?: boolean }>;
  hidden?: Record<string, string>;
  inline?: boolean;
}) {
  return (
    <form action={action} className={inline ? "inline-flex" : "mt-2 flex flex-wrap gap-1"}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <input
          key={f.name}
          name={f.name}
          type={f.type ?? "text"}
          required={!f.optional}
          placeholder={f.placeholder}
          className={
            f.small
              ? "w-20 rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-xs"
              : "min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
          }
        />
      ))}
      {!inline && (
        <button className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100">
          Add
        </button>
      )}
    </form>
  );
}

function DeleteBtn({ kind, id, small = false }: { kind: string; id: string; small?: boolean }) {
  return (
    <form action={deleteEntity} className="inline">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button
        className={`text-zinc-300 hover:text-red-500 ${small ? "text-xs" : "px-1 text-sm"}`}
        title="Delete"
      >
        ✕
      </button>
    </form>
  );
}
