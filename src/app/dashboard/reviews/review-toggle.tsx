"use client";

import { useState, useTransition } from "react";
import { SwitchTrack } from "@/components/toggle-switch";
import { toggleReviewPublish } from "./actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

export function ReviewPublishToggle({ id, published }: { id: string; published: boolean }) {
  const lang = useLang();
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
      className="flex shrink-0 items-center gap-2 transition disabled:opacity-60"
      title={on ? tr(lang, "ظاهر للعملاء", "Visible to customers") : tr(lang, "مخفي", "Hidden")}
    >
      {/* الكلمة تبقى مع المفتاح: في قائمةٍ كثيفة، مفتاحٌ عارٍ لا يقول ماذا
          يضبط. والشكل هو نفسه في كلّ اللوحة — الكلمة زيادةٌ لا استثناء. */}
      <span className="text-[11px] font-bold" style={{ color: on ? "var(--brand-d)" : "var(--muted)" }}>
        {on ? tr(lang, "منشور", "Published") : tr(lang, "مخفي", "Hidden")}
      </span>
      <SwitchTrack on={on} />
    </button>
  );
}
