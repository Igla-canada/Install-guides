"use client";
// Manufacturer logo for the Guides menu tiles. Uses the admin-set logoUrl if
// present, otherwise tries a public car-logo CDN by brand slug, and falls back
// to a clean monogram if neither image loads — so a tile never shows a broken
// image.
import { useState } from "react";

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function MakeLogo({
  name,
  logoUrl,
  size = 40,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
}) {
  const cdnGuess = `https://cdn.jsdelivr.net/gh/filippofilip95/car-logos-dataset@master/logos/optimized/${slug(name)}.png`;
  const [src, setSrc] = useState<string>(logoUrl || cdnGuess);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-zinc-200 font-semibold text-zinc-600"
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className="shrink-0 rounded object-contain"
      style={{ width: size, height: size }}
      onError={() => {
        // try the CDN guess once if a custom logoUrl failed, else monogram
        if (logoUrl && src === logoUrl) setSrc(cdnGuess);
        else setFailed(true);
      }}
    />
  );
}
