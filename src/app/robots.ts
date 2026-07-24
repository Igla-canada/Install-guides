import type { MetadataRoute } from "next";

/** Entire site is private — disallow all crawlers. No sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
