"use client";
// View-only hardening for installer-facing pages: blocks context menu, save/
// print shortcuts and drag, and reports zoom/section interactions to the audit
// trail. Deterrence, not prevention — the watermark is the real control.
import { useEffect } from "react";

export default function ViewerShield({ guildId }: { guildId: string }) {
  useEffect(() => {
    const track = (action: string, meta?: Record<string, unknown>) => {
      void fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId, action, meta }),
        keepalive: true,
      }).catch(() => {});
    };

    const onContext = (e: Event) => e.preventDefault();
    const onDrag = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["p", "s", "u"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        track("denied", { blocked: `ctrl+${e.key.toLowerCase()}` });
      }
    };
    const onCopy = (e: ClipboardEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest?.("[data-zoomable]");
      if (target) track("image_zoom");
    };

    // Count returns to this guide: the first open is logged server-side as
    // "view"; coming back to the tab (visibility) or via back/forward (bfcache)
    // is logged here as "revisit" so we know how often it's re-opened.
    let hidden = document.visibilityState === "hidden";
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (hidden) track("revisit", { reason: "refocus" });
        hidden = false;
      } else {
        hidden = true;
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) track("revisit", { reason: "restored" });
    };

    document.addEventListener("contextmenu", onContext);
    document.addEventListener("dragstart", onDrag);
    document.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("click", onClick);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("dragstart", onDrag);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      document.body.style.userSelect = "";
    };
  }, [guildId]);

  return (
    <p className="print-blocked-notice p-8 text-center text-sm">
      Printing is disabled for this document.
    </p>
  );
}
