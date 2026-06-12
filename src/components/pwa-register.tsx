"use client";
import { useEffect } from "react";
import { flushQueue } from "@/lib/client/offline";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Replay any offline-queued edits/photos from a previous session.
    void flushQueue();
  }, []);
  return null;
}
