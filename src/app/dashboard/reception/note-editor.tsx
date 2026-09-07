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
        className="mt-1 block w-full truncate text-start text-xs font-bold transition"
        style={{ color: saved ? "var(--brand-d)" : "var(--muted)" }}
        title={saved || tr(lang, "إضافة ملاحظة استقبال", "Add a reception note")}
      >
        {saved ? `☎️ ${saved}` : `+ ${tr(lang, "ملاحظة استقبال", "Reception note")}`}
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setValue(saved); setOpen(false); } }}
        onBlur={save}
        disabled={pending}
        placeholder={tr(lang, "مثلاً: اتصلنا عليه، يبي نص ساعة", "e.g. called, wants 30 min")}
        maxLength={200}
        className="w-full rounded-lg border border-[var(--hairline)] px-2 py-1 text-xs font-bold outline-none"
        style={{ background: "var(--surface-2)", color: "var(--ink)" }}
      />
    </div>
  );
}
