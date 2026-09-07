"use client";

import { useState, useTransition } from "react";
import { updateWaitlistNote } from "../waitlist-actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

/**
 * ملاحظة الاستقبال على الدور نفسه — غير ملاحظة العميل الدائمة (تظهر فقط
 * لصلاحية «العملاء» وتبقى عبر كل زياراته). هذي خاصّة بهذا الدور تحديدًا
 * («اتصلنا عليه، يبي نص ساعة») وتظهر لكل الاستقبال بلا صلاحية إضافية —
 * طلب المشغّل: تفريق «اتصلنا عليه» عن «ما اتصلنا» بلا خلط بين المراجعين.
 */
export function NoteEditor({ id, initialNote }: { id: string; initialNote: string | null }) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialNote ?? "");
  const [saved, setSaved] = useState(initialNote ?? "");
  const [pending, start] = useTransition();

  function save() {
    const trimmed = value.trim();
    if (trimmed === saved.trim()) { setOpen(false); return; }
    start(async () => {
      const ok = await updateWaitlistNote(id, trimmed || null);
      if (ok) { setSaved(trimmed); setOpen(false); }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 block w-full whitespace-pre-line text-start text-xs font-bold leading-snug transition"
        style={{ color: saved ? "var(--brand-d)" : "var(--muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        title={saved || tr(lang, "إضافة ملاحظة استقبال", "Add a reception note")}
      >
        {saved ? `☎️ ${saved}` : `+ ${tr(lang, "ملاحظة استقبال", "Reception note")}`}
      </button>
    );
  }

  return (
    <div className="mt-1.5 flex flex-col items-stretch gap-1.5">
      <textarea
        autoFocus
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
          if (e.key === "Escape") { setValue(saved); setOpen(false); }
        }}
        onBlur={save}
        disabled={pending}
        placeholder={tr(lang, "مثلاً: اتصلنا عليه، يبي نص ساعة", "e.g. called him, wants 30 more minutes")}
        maxLength={280}
        className="w-full resize-none rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm font-bold leading-snug outline-none"
        style={{ background: "var(--surface-2)", color: "var(--ink)" }}
      />
    </div>
  );
}
