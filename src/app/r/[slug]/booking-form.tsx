"use client";

import { useActionState, useMemo, useState } from "react";
import { createReservation, type BookingState } from "./actions";

type Branch = {
  id: string;
  name: string;
  timezone: string;
};

export function BookingForm({
  slug,
  branches,
  defaultName,
  defaultPhone,
}: {
  slug: string;
  branches: Branch[];
  defaultName: string;
  defaultPhone: string;
}) {
  const [state, formAction, pending] = useActionState<BookingState, FormData>(
    createReservation,
    { ok: false },
  );

  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const timezone = useMemo(
    () => branches.find((b) => b.id === branchId)?.timezone ?? "Asia/Riyadh",
    [branchId, branches],
  );

  const minDateTime = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }, []);

  if (state.ok) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-3xl dark:bg-brand-900/50">
          ✓
        </span>
        <p className="text-xl font-extrabold text-brand-800 dark:text-brand-200">{state.message}</p>
        <p className="text-sm text-stone-500">يمكنك متابعة حجوزاتك من صفحة حسابك.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-5 p-7">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="timezone" value={timezone} />

      {branches.length > 1 && (
        <Field label="الفرع" htmlFor="branch_id">
          <select
            id="branch_id"
            name="branch_id"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="field-input"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
      )}
      {branches.length <= 1 && <input type="hidden" name="branch_id" value={branchId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الاسم" htmlFor="full_name">
          <input id="full_name" name="full_name" required defaultValue={defaultName} className="field-input" placeholder="اسمك الكامل" />
        </Field>
        <Field label="رقم الجوّال" htmlFor="phone">
          <input id="phone" name="phone" required dir="ltr" inputMode="tel" defaultValue={defaultPhone} className="field-input text-left" placeholder="05xxxxxxxx" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="عدد الأشخاص" htmlFor="party_size">
          <input id="party_size" name="party_size" type="number" min={1} max={20} defaultValue={2} required className="field-input" />
        </Field>
        <Field label="التاريخ والوقت" htmlFor="reserved_at">
          <input id="reserved_at" name="reserved_at" type="datetime-local" min={minDateTime} required className="field-input" />
        </Field>
      </div>

      <Field label="ملاحظات (اختياري)" htmlFor="notes">
        <textarea id="notes" name="notes" rows={2} className="field-input" placeholder="مثال: طاولة بجانب النافذة" />
      </Field>

      {state.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full text-base">
        {pending ? "جارٍ إرسال الطلب…" : "تأكيد الحجز"}
      </button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="field-label">{label}</label>
      {children}
    </div>
  );
}
