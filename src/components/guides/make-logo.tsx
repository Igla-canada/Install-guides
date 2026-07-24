"use client";
// Manufacturer logo for the Guides menu tiles. Uses the admin-set logoUrl if
// present, otherwise tries a public car-logo CDN by brand slug, and falls back
// to a monogram. Monogram stays visible until the image loads to avoid flicker.
import { useEffect, useState } from "react";

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
  const preferred = logoUrl?.trim() || cdnGuess;
  const [src, setSrc] = useState(preferred);
  const [phase, setPhase] = useState<"try-preferred" | "try-cdn" | "mono">(
    "try-preferred",
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSrc(logoUrl?.trim() || cdnGuess);
    setPhase("try-preferred");
    setLoaded(false);
  }, [name, logoUrl, cdnGuess]);

  const showMono = phase === "mono" || !loaded;

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded"
      style={{ width: size, height: size }}
    >
      {showMono && (
        <span
          className="absolute inset-0 flex items-center justify-center rounded-full bg-zinc-200 font-semibold text-zinc-600"
          style={{ fontSize: size * 0.42 }}
          aria-hidden={loaded}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      {phase !== "mono" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="relative rounded object-contain transition-opacity duration-150"
          style={{
            width: size,
            height: size,
            opacity: loaded ? 1 : 0,
          }}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (phase === "try-preferred" && logoUrl?.trim() && src === logoUrl.trim()) {
              setSrc(cdnGuess);
              setPhase("try-cdn");
              setLoaded(false);
            } else {
              setPhase("mono");
              setLoaded(false);
            }
          }}
        />
      )}
    </span>
  );
}
