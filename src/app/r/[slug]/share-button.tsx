"use client";

import { useState } from "react";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

/** زر مشاركة صفحة المطعم — Web Share API مع نسخ الرابط كبديل. */
export function ShareButton({ title }: { title: string }) {
  const lang = useLang();
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const data = { title, text: title, url };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(data);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      /* أُلغيت المشاركة أو تعذّرت — نتجاهل بهدوء */
    }
  }

  return (
    <button onClick={onShare} className="rq-circle" aria-label={tr(lang, "مشاركة", "Share")}>
      {copied ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3v12M12 3l-4 4M12 3l4 4M6 13v5a2 2 0 002 2h8a2 2 0 002-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      )}
    </button>
  );
}
