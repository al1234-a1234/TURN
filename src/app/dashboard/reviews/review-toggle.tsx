"use client";

import { useState, useTransition } from "react";
import { toggleReviewPublish } from "./actions";

export function ReviewPublishToggle({ id, published }: { id: string; published: boolean }) {
  const [on, setOn] = useState(published);
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !on;
          setOn(next);
          await toggleReviewPublish(id, next);
        })
      }
      className="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition disabled:opacity-60"
      style={
        on
          ? { background: "var(--sage)", color: "var(--brand-d)" }
          : { background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }
      }
      title={on ? "ظاهر للعملاء" : "مخفي"}
    >
      {on ? "منشور ✓" : "مخفي"}
    </button>
  );
}
