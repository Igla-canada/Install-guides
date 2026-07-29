import type { NextConfig } from "next";

const ROBOTS =
  "noindex, nofollow, noarchive, nosnippet, noimageindex";

// Content-Security-Policy. Tuned to what the app actually loads:
// - images come from S3 signed URLs + admin-pasted manufacturer logo URLs
//   (jsdelivr and friends), so img-src has to allow https: and data:/blob:
// - Next's hydration/runtime uses inline scripts; dev additionally needs
//   'unsafe-eval' for React Refresh, so it's only relaxed outside production
// - frame-ancestors 'self' blocks clickjacking (X-Frame-Options is the
//   legacy fallback for old browsers)
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "media-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

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
          { key: "Content-Security-Policy", value: CSP },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
