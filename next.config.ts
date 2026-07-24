import type { NextConfig } from "next";

const ROBOTS =
  "noindex, nofollow, noarchive, nosnippet, noimageindex";

const nextConfig: NextConfig = {
  // The Guides page route was renamed /guilds -> /guides. Keep old bookmarks /
  // links working. (The internal /api/guilds endpoints are unchanged.)
  async redirects() {
    return [
      { source: "/guilds", destination: "/guides", permanent: true },
      { source: "/guilds/:path*", destination: "/guides/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: ROBOTS },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
