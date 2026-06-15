import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Guides page route was renamed /guilds -> /guides. Keep old bookmarks /
  // links working. (The internal /api/guilds endpoints are unchanged.)
  async redirects() {
    return [
      { source: "/guilds", destination: "/guides", permanent: true },
      { source: "/guilds/:path*", destination: "/guides/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
