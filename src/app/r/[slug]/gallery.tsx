"use client";

import { useEffect, useState } from "react";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { SmartImage } from "@/components/smart-image";

type Photo = { id: string; url: string; caption: string | null };

export function Gallery({ photos }: { photos: Photo[] }) {
  const lang = useLang();
  // «أجواء» بطلب المشغّل الحرفي — وتطابق تسمية اللوحة نفسها («صور الأجواء»)
  const label = tr(lang, "أجواء", "Ambience");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, photos.length]);

  if (!photos.length) return null;

  const go = (d: number) => setOpen((i) => (i === null ? i : (i + d + photos.length) % photos.length));

  return (
    <div className="mt-6">
      <p className="mb-3 font-display text-base font-bold text-[color:var(--ink)]">{label}</p>
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {photos.map((ph, i) => (
          <button
            key={ph.id}
            type="button"
            onClick={() => setOpen(i)}
            className="relative aspect-[4/3] w-[80%] shrink-0 snap-center overflow-hidden rounded-3xl border text-start transition active:scale-[0.98] sm:w-[46%]"
            style={{ borderColor: "var(--border)" }}
          >
            <SmartImage src={ph.url} fallbackText="٨" alt={ph.caption ?? ""} width={384} height={384} sizes="(max-width: 640px) 50vw, 240px" className="h-full w-full object-cover" />
            {ph.caption && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-3 text-sm font-bold text-cream-100">{ph.caption}</span>
            )}
            <span className="absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-xs text-cream-100">⤢</span>
          </button>
        ))}
      </div>

      {/* عارض ملء الشاشة */}
      {open !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal
          onClick={() => setOpen(null)}
        >
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="absolute end-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-xl text-cream-100"
            aria-label={tr(lang, "إغلاق", "Close")}
          >
            ✕
          </button>

          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                className="absolute start-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-2xl text-cream-100"
                aria-label={tr(lang, "السابق", "Previous")}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                className="absolute end-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-2xl text-cream-100"
                aria-label={tr(lang, "التالي", "Next")}
              >
                ›
              </button>
            </>
          )}

          <figure className="max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <SmartImage src={photos[open].url} fallbackText="٨" alt={photos[open].caption ?? ""} width={1080} height={1080} sizes="100vw" className="max-h-[80vh] w-full rounded-2xl object-contain" />
            {photos[open].caption && (
              <figcaption className="mt-3 text-center text-sm font-bold text-cream-100/90">{photos[open].caption}</figcaption>
            )}
            <p className="mt-1 text-center text-xs text-cream-100/50">{open + 1} / {photos.length}</p>
          </figure>
        </div>
      )}
    </div>
  );
}
