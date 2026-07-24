"use client";
import { useEffect } from "react";
import { flushQueue } from "@/lib/client/offline";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Dev/Turbopack serves fresh chunks every reload; a cached SW causes
      // ChunkLoadError loops and a flickering login page on localhost.
      if (process.env.NODE_ENV === "development") {
        void navigator.serviceWorker.getRegistrations().then(async (regs) => {
          for (const reg of regs) await reg.unregister();
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        });
      } else {
        void navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    }
    // Replay any offline-queued edits/photos from a previous session.
    void flushQueue();
  }, []);
  return null;
}
