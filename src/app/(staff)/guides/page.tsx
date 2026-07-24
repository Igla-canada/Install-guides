// Guide library — cascade search, icons/list views, status tabs (incl. Archived).
// Shared UI with installer /my-guides via GuideBrowser; this page adds staff
// chrome (tabs, archive, floating peek, "+ New guide").
import { prisma } from "@/lib/db";
import { GuideBrowser } from "@/components/guides/guide-browser";

export default async function GuildsPage(props: {
  searchParams: Promise<{
    make?: string;
    year?: string;
    model?: string;
    q?: string;
    status?: string;
    view?: string;
  }>;
}) {
  const sp = await props.searchParams;

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

  return (
    <GuideBrowser
      guilds={guilds}
      sp={sp}
      basePath="/guides"
      title="Guides"
      guideBasePath="/guides"
      newGuide={{ href: "/guides/new", label: "+ New guide" }}
      statusTabs
      showMeta
      showStatusBadge
    />
  );
}
