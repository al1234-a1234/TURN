"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { addWalkIn, type WalkInState } from "./walkin-actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

export function WalkInForm({
  branchId,
  branchName,
  hasInside = true,
  hasOutside = true,
}: {
  branchId: string;
  branchName?: string;
  /** أقسام الفرع — الموظّف لا يُجلس أحدًا في قسمٍ لا يملكه المطعم */
  hasInside?: boolean;
  hasOutside?: boolean;
}) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  // نجاح/فشل مرئيان — الفشل الصامت كان يوهم المضيف أن الضيف انضاف وهو لم يُسجَّل
  const [state, action, pending] = useActionState<WalkInState, FormData>(addWalkIn, { ok: false });
  const formRef = useRef<HTMLFormElement | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2500);
      return () => clearTimeout(t);
    }
  }, [state]);

  const field = "field-input";

  return (
    <section className="soft-card mb-5 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-display text-base font-bold text-[color:var(--ink)]"
      >
        <span>
          ➕ {tr(lang, "إضافة عميل للطابور", "Add walk-in to queue")}
          {branchName ? <span className="text-sm font-medium text-[color:var(--muted)]"> · {branchName}</span> : null}
        </span>
        <span className="text-[color:var(--muted)]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <form ref={formRef} action={action} className="mt-4 space-y-3">
          <input type="hidden" name="branch_id" value={branchId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="full_name" placeholder={tr(lang, "الاسم (اختياري)", "Name (optional)")} className={field} />
            <input name="phone" required dir="ltr" placeholder="05xxxxxxxx" className={field} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="party_size" inputMode="numeric" defaultValue="2" placeholder={tr(lang, "عدد الأشخاص", "Party size")} className={field} />
            {hasInside && hasOutside ? (
              <select name="zone" defaultValue="inside" className={field}>
                <option value="inside">{tr(lang, "داخلي", "Indoor")}</option>
                <option value="outside">{tr(lang, "خارجي", "Outdoor")}</option>
              </select>
            ) : (
              // قسمٌ واحد: لا قائمة اختيارٍ بخيارٍ يتيم — يُرسَل صامتًا
              <input type="hidden" name="zone" value={hasOutside ? "outside" : "inside"} />
            )}
          </div>
          {state.error && (
            <p className="rounded-xl px-3 py-2 text-sm font-bold text-[color:var(--danger)]" style={{ background: "rgba(200,70,70,0.08)" }}>
              {state.error}
            </p>
          )}
          {flash && (
            <p className="rounded-xl px-3 py-2 text-sm font-extrabold text-cream-100" style={{ background: "var(--brand-solid)" }}>
              ✓ {tr(lang, "انضاف للطابور", "Added to the queue")}
            </p>
          )}
          <button disabled={pending} className="btn btn-primary w-full disabled:opacity-60">
            {pending ? tr(lang, "جارٍ الإضافة…", "Adding…") : tr(lang, "أضف للطابور", "Add to queue")}
          </button>
        </form>
      )}
    </section>
  );
}
