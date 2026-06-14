import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Igla Guides",
    short_name: "Igla Guides",
    description: "Igla installation guides — authoring and controlled access",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#18181b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
