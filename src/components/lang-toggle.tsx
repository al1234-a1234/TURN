"use client";

import { useTransition } from "react";
import { useLang } from "./lang-provider";
import { LANG_SHORT, type Lang } from "@/lib/i18n";

/**
 * مبدّل اللغة (عربي/إنجليزي). يحفظ الاختيار في كوكي سنة كاملة ويعيد التحميل
 * ليُعاد رسم الصفحات على الخادم باللغة الجديدة (والاتجاه RTL/LTR).
 */
export function LangToggle({ variant = "header" }: { variant?: "header" | "plain" }) {
  const lang = useLang();
  const [pending, start] = useTransition();

  const switchTo = (next: Lang) => {
    if (next === lang) return;
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    start(() => window.location.reload());
  };

  const base =
    variant === "header"
      ? "inline-flex items-center gap-0.5 rounded-full border p-0.5 text-xs font-bold"
      : "inline-flex items-center gap-0.5 rounded-full border p-0.5 text-sm font-bold";
  const headerColors = variant === "header" ? { borderColor: "rgba(255,255,255,0.28)" } : { borderColor: "var(--border)" };

  return (
    <span className={base} style={headerColors} aria-label="Language" data-pending={pending}>
      {(["ar", "en"] as Lang[]).map((l) => {
        const on = l === lang;
        return (
          <button
            key={l}
            type="button"
            onClick={() => switchTo(l)}
            className="rounded-full px-2 py-0.5 transition"
            style={
              on
                ? { background: variant === "header" ? "rgba(255,255,255,0.9)" : "var(--brand-d)", color: variant === "header" ? "#661c0a" : "#fff" }
                : { color: variant === "header" ? "rgba(255,255,255,0.85)" : "var(--muted)" }
            }
          >
            {LANG_SHORT[l]}
          </button>
        );
      })}
    </span>
  );
}
