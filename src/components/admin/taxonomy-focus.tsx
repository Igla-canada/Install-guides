"use client";

import { useEffect } from "react";

/** After a taxonomy save/move redirect, scroll the working row back into view. */
export default function TaxonomyFocus({
  modelId,
  genId,
}: {
  modelId?: string;
  genId?: string;
}) {
  useEffect(() => {
    const id = genId ? `tax-gen-${genId}` : modelId ? `tax-model-${modelId}` : null;
    if (!id) return;
    // Wait a tick so <details open> has laid out.
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [modelId, genId]);
  return null;
}
