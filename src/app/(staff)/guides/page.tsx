// Guide library — hierarchical browsing, not a flat dump:
// manufacturers → years → models available that year → the guides themselves.
// Search (?q=) falls back to a flat filtered table. The browsing UI is shared
// with the installer home (/my-guilds) via GuideBrowser; this page adds the
// staff-only chrome (status tabs, "+ New guide", editor links + metadata).
import { prisma } from "@/lib/db";
import { GuideBrowser } from "@/components/guides/guide-browser";

export default async function GuildsPage(props: {
  searchParams: Promise<{ make?: string; year?: string; model?: string; q?: string; status?: string }>;
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
      guideHref={(id) => `/guides/${id}`}
      newGuide={{ href: "/guides/new", label: "+ New guide" }}
      statusTabs
      showMeta
      showStatusBadge
    />
  );
}
