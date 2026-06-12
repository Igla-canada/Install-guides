"use client";
// Resolves an image reference (server asset id or pending:<uuid> offline blob)
// to a displayable URL.
import { useEffect, useState } from "react";
import { pendingImageUrl } from "@/lib/client/offline";

export function useImageUrl(ref: string | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    if (!ref) return;
    (async () => {
      if (ref.startsWith("pending:")) {
        objectUrl = await pendingImageUrl(ref.slice("pending:".length));
        if (!cancelled) setUrl(objectUrl);
      } else {
        const res = await fetch(`/api/images/${ref}/url`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setUrl(data.url);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ref]);
  return url;
}
