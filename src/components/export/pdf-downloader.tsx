"use client";
// Admin PDF export. Rasterizes each rendered guide article (images already
// inlined as data URLs server-side, so the canvas isn't tainted) into one
// multi-page PDF. html2canvas-pro is used because Tailwind v4 emits oklch()
// colors, which the classic html2canvas can't parse.
import { useEffect, useRef, useState } from "react";

export default function PdfDownloader({
  filename,
  auto = false,
}: {
  filename: string;
  auto?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  const run = async () => {
    setBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      const articles = Array.from(
        document.querySelectorAll<HTMLElement>("[data-export-article]")
      );
      if (articles.length === 0) return;

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const usableW = pageW - margin * 2;

      let firstArticle = true;
      for (const el of articles) {
        const canvas = await html2canvas(el, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
        });
        const imgW = usableW;
        const imgH = (canvas.height / canvas.width) * imgW;
        const usableH = pageH - margin * 2;

        // Slice a tall guide across multiple pages.
        let renderedH = 0;
        let firstSlice = true;
        while (renderedH < imgH - 1) {
          if (!firstArticle || !firstSlice) pdf.addPage();
          firstArticle = false;
          const sliceH = Math.min(usableH, imgH - renderedH);
          // crop the source canvas for this page slice
          const sliceCanvas = document.createElement("canvas");
          const srcSliceH = (sliceH / imgH) * canvas.height;
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = srcSliceH;
          const ctx = sliceCanvas.getContext("2d")!;
          ctx.drawImage(
            canvas,
            0,
            (renderedH / imgH) * canvas.height,
            canvas.width,
            srcSliceH,
            0,
            0,
            canvas.width,
            srcSliceH
          );
          pdf.addImage(
            sliceCanvas.toDataURL("image/jpeg", 0.92),
            "JPEG",
            margin,
            margin,
            imgW,
            sliceH
          );
          renderedH += sliceH;
          firstSlice = false;
        }
      }
      pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  // auto-start once on mount when requested (single-guide download links)
  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    const t = setTimeout(() => void run(), 500); // let inlined images paint first
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <button
      onClick={() => void run()}
      disabled={busy}
      className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
    >
      {busy ? "Building PDF…" : done ? "✓ Downloaded — click to redo" : "⬇ Download PDF"}
    </button>
  );
}
