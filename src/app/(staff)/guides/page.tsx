// Guide library — cascade search, icons/list views, status tabs (incl. Archived).
// Shared UI with installer /my-guides via GuideBrowser; this page adds staff
// chrome (tabs, archive, floating peek, "+ New guide").
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { GuideBrowser } from "@/components/guides/guide-browser";

export default async function GuildsPage(props: {
  searchParams: Promise<{
    make?: string;
    year?: string;
    model?: string;
    q?: string;
    status?: string;
    view?: string;
    compat?: string;
  }>;
}) {
  const sp = await props.searchParams;
  const user = await currentUser();

  const guilds = await prisma.guild.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      make: true,
      model: true,
      generation: true,
      trim: true,
      iglaProduct: { include: { productLine: true } },
      updatedBy: { select: { name: true } },
    },
  });

  const compatRows = await prisma.vehicleCompatibility.findMany({
    where: { sourceGuideId: { in: guilds.map((g) => g.id) } },
    select: {
      sourceGuideId: true,
      blockKind: true,
      analogBlockRequired: true,
      analogBlockType: true,
    },
  });
  const compatByGuideId: Record<
    string,
    {
      blockKind: string | null;
      analogBlockRequired: boolean;
      analogBlockType: string | null;
    }
  > = {};
  for (const row of compatRows) {
    if (!row.sourceGuideId) continue;
    compatByGuideId[row.sourceGuideId] = {
      blockKind: row.blockKind,
      analogBlockRequired: row.analogBlockRequired,
      analogBlockType: row.analogBlockType,
    };
  }

  return (
    <GuideBrowser
      guilds={guilds}
      compatByGuideId={compatByGuideId}
      sp={sp}
      basePath="/guides"
      title="Guides"
      guideBasePath="/guides"
      newGuide={{ href: "/guides/new", label: "+ New guide" }}
      statusTabs
      showMeta
      showStatusBadge
      canDeletePermanently={user?.role === "ADMIN"}
    />
  );
}
