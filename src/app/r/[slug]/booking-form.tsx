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

  // أقل قيمة لحقل التاريخ/الوقت = الآن (بصيغة datetime-local)
  const minDateTime = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }, []);

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center dark:border-teal-900 dark:bg-teal-950/40">
        <p className="text-lg font-semibold text-teal-800 dark:text-teal-200">
          ✓ {state.message}
        </p>
        <p className="mt-2 text-sm text-teal-700/80 dark:text-teal-300/80">
          يمكنك متابعة حجوزاتك من صفحة حسابك.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="timezone" value={timezone} />

      {branches.length > 1 && (
        <Field label="الفرع" htmlFor="branch_id">
          <select
            id="branch_id"
            name="branch_id"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {branches.length <= 1 && (
        <input type="hidden" name="branch_id" value={branchId} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الاسم" htmlFor="full_name">
          <input
            id="full_name"
            name="full_name"
            required
            defaultValue={defaultName}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="اسمك الكامل"
          />
        </Field>

        <Field label="رقم الجوّال" htmlFor="phone">
          <input
            id="phone"
            name="phone"
            required
            dir="ltr"
            inputMode="tel"
            defaultValue={defaultPhone}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-left outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="05xxxxxxxx"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="عدد الأشخاص" htmlFor="party_size">
          <input
            id="party_size"
            name="party_size"
            type="number"
            min={1}
            max={20}
            defaultValue={2}
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </Field>

        <Field label="التاريخ والوقت" htmlFor="reserved_at">
          <input
            id="reserved_at"
            name="reserved_at"
            type="datetime-local"
            min={minDateTime}
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </Field>
      </div>

      <Field label="ملاحظات (اختياري)" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="مثال: طاولة بجانب النافذة"
        />
      </Field>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-teal-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
      >
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
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
