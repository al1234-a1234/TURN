"use client";

import { useActionState, useEffect, useRef } from "react";
import { createReservation, type NewReservationState } from "./actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { normalizePhone } from "@/lib/format";
import { zoneLabel, type Zone } from "@/lib/zones";

/**
 * حجز جديد من الاستقبال.
 *
 * كان نموذجًا صامتًا: يفشل الحجز فتعود الصفحة كما هي، فيقرأه الموظّف نجاحًا
 * ويعد العميل بطاولة لا وجود لها. الآن يقول ما حدث — واسم الطاولة المعيَّنة
 * جزءٌ من النجاح لا تفصيلًا: هو ما يقوله الموظّف للعميل عند الباب.
 */
export function NewReservation({
  branchId,
  branchName,
  zones,
}: {
  branchId: string;
  branchName?: string;
  /** أقسام الفرع الفعّالة بأسماء المالك */
  zones: Zone[];
}) {
  const lang = useLang();
  const [state, formAction, pending] = useActionState<NewReservationState, FormData>(
    createReservation,
    { ok: false },
  );
  const formRef = useRef<HTMLFormElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);

  // نجاحٌ يترك بيانات العميل السابق في الحقول يجعل الموظّف يحجز له مرّتين
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok, state.table]);

  const bothZones = zones.length > 1;
  const field = "field-input";

  return (
    <section className="soft-card mb-6 p-5">
      <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">
        {tr(lang, "حجز جديد", "New reservation")}
      </h2>
      <p className="mb-4 text-xs font-bold text-[color:var(--muted)]">
        {branchName
          ? tr(lang, `يُسجَّل في فرع: ${branchName}`, `Filed under branch: ${branchName}`)
          : tr(lang, "تُعيَّن الطاولة تلقائيًّا — أصغر مقاسٍ يكفي", "The table is assigned automatically — smallest that fits")}
      </p>

      <form ref={formRef} action={formAction} className="space-y-3">
        <input type="hidden" name="branch_id" value={branchId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="full_name" placeholder={tr(lang, "اسم العميل", "Customer name")} className={field} />
          <input
            name="phone" required dir="ltr" inputMode="numeric" maxLength={10}
            ref={phoneRef}
            onChange={(e) => { e.target.value = normalizePhone(e.target.value).slice(0, 10); }}
            placeholder="05xxxxxxxx" className={`${field} text-left`}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="datetime-local" name="reserved_at" required className={field} />
          <input name="party_size" inputMode="numeric" defaultValue="2" placeholder={tr(lang, "عدد الأشخاص", "Party size")} className={field} />
        </div>
        {/* القسم يضيّق الاختيار على طاولات ذلك القسم — وفرعٌ بقسمٍ واحد لا يُسأل */}
        {bothZones ? (
          <select name="zone" className={field} defaultValue="">
            <option value="">{tr(lang, "أيّ قسم", "Any area")}</option>
            {zones.map((z) => (
              <option key={z.key} value={z.key}>{zoneLabel(z, lang)}</option>
            ))}
          </select>
        ) : (
          <input type="hidden" name="zone" value={zones[0]?.key ?? ""} />
        )}
        <input name="notes" placeholder={tr(lang, "ملاحظات (اختياري)", "Notes (optional)")} className={field} />

        {state.error && (
          <p className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: "var(--surface-2)", border: "1px solid rgba(156,59,38,0.35)", color: "var(--danger)" }}>
            {state.error}
          </p>
        )}
        {state.ok && (
          <p className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--st-open)" }}>
            {state.table
              ? tr(lang, `تمّ الحجز — الطاولة ${state.table}`, `Booked — table ${state.table}`)
              : tr(lang, "تمّ الحجز.", "Booked.")}
          </p>
        )}

        <button disabled={pending} className="btn btn-primary w-full disabled:opacity-60">
          {pending ? tr(lang, "جارٍ الحجز…", "Booking…") : tr(lang, "تأكيد الحجز", "Confirm reservation")}
        </button>
      </form>
    </section>
  );
}
