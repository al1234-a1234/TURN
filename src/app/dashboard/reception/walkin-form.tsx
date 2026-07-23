"use client";

import { useState } from "react";
import { addWalkIn } from "./walkin-actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

export function WalkInForm() {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const field = "field-input";

  return (
    <section className="soft-card mb-5 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-display text-base font-bold text-[color:var(--ink)]"
      >
        <span>➕ {tr(lang, "إضافة عميل للطابور", "Add walk-in to queue")}</span>
        <span className="text-[color:var(--muted)]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <form action={addWalkIn} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="full_name" placeholder={tr(lang, "الاسم (اختياري)", "Name (optional)")} className={field} />
            <input name="phone" required dir="ltr" placeholder="05xxxxxxxx" className={field} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="party_size" inputMode="numeric" defaultValue="2" placeholder={tr(lang, "عدد الأشخاص", "Party size")} className={field} />
            <select name="zone" defaultValue="inside" className={field}>
              <option value="inside">{tr(lang, "داخلي", "Indoor")}</option>
              <option value="outside">{tr(lang, "خارجي", "Outdoor")}</option>
            </select>
          </div>
          <button className="btn btn-primary w-full">{tr(lang, "أضف للطابور", "Add to queue")}</button>
        </form>
      )}
    </section>
  );
}
