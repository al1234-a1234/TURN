"use client";

import { useTransition } from "react";
import { dismissInsight } from "./insight-actions";

/** زر إخفاء البصيرة (يوسمها مقروءة فتختفي من اللوحة). */
export function DismissInsight({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="إخفاء"
      disabled={pending}
      onClick={() => start(async () => { await dismissInsight(id); })}
      className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-[color:var(--muted)] transition hover:text-[color:var(--brand-d)]"
    >
      ✕
    </button>
  );
}
