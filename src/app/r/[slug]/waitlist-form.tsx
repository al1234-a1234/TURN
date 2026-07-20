"use client";

import { useActionState, useMemo, useState } from "react";
import { joinWaitlist, type WaitlistState } from "./actions";

type Branch = {
  id: string;
  name: string;
  total: number;
  inside: number;
  outside: number;
};

const ZONES: { value: string; label: string }[] = [
  { value: "any", label: "أي مكان" },
  { value: "inside", label: "الداخل" },
  { value: "outside", label: "الخارج" },
];

export function WaitlistForm({
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
  const [state, formAction, pending] = useActionState<WaitlistState, FormData>(
    joinWaitlist,
    { ok: false },
  );

  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [zone, setZone] = useState("any");
  const [party, setParty] = useState(1);

  const branch = useMemo(
    () => branches.find((b) => b.id === branchId) ?? branches[0],
    [branchId, branches],
  );

  if (state.ok) {
    return (
      <div className="soft-card flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-3xl font-extrabold text-white shadow-[var(--shadow-lift)]">
          #{state.position ?? "—"}
        </span>
        <p className="text-xl font-extrabold text-brand-800 dark:text-cream-100">
          انضممت إلى قائمة الانتظار!
        </p>
        <p className="text-sm text-[color:var(--muted)]">
          دورك رقم {state.position ?? "—"}. سنُشعرك عند اقتراب دورك — تابع من صفحة حسابك.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="zone" value={zone} />
      <input type="hidden" name="party_size" value={party} />

      {/* عدّادات الطابور */}
      <div className="soft-card grid grid-cols-2 divide-x divide-x-reverse divide-[var(--border)] p-6 text-center">
        <div>
          <p className="text-sm text-[color:var(--muted)]">الداخل</p>
          <p className="mt-1 text-4xl font-extrabold text-brand-700 dark:text-brand-300">
            {branch?.inside ?? 0}
          </p>
        </div>
        <div>
          <p className="text-sm text-[color:var(--muted)]">الخارج</p>
          <p className="mt-1 text-4xl font-extrabold text-brand-700 dark:text-brand-300">
            {branch?.outside ?? 0}
          </p>
        </div>
      </div>

      {branches.length > 1 && (
        <div className="soft-card p-5">
          <p className="field-label">الفرع</p>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="field-input"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* اختيار المنطقة */}
      <div className="soft-card p-5">
        <p className="mb-3 font-bold text-brand-800 dark:text-cream-100">اختر المنطقة</p>
        <div className="space-y-2">
          {ZONES.map((z) => (
            <button
              type="button"
              key={z.value}
              onClick={() => setZone(z.value)}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-right transition ${
                zone === z.value
                  ? "border-brand-600 bg-brand-50 dark:bg-brand-900/40"
                  : "border-[var(--border)]"
              }`}
            >
              <span className="font-bold">{z.label}</span>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                  zone === z.value ? "border-brand-600" : "border-[var(--border)]"
                }`}
              >
                {zone === z.value && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* عدد الكراسي */}
      <div className="soft-card p-5">
        <p className="mb-3 font-bold text-brand-800 dark:text-cream-100">اختر عدد الكراسي</p>
        <div className="flex flex-row-reverse flex-wrap gap-2">
          {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setParty(n)}
              className={`chair ${party === n ? "chair-active" : ""}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* بيانات العميل */}
      <div className="soft-card space-y-4 p-5">
        <div>
          <label htmlFor="full_name" className="field-label">الاسم</label>
          <input id="full_name" name="full_name" required defaultValue={defaultName} className="field-input" placeholder="اسمك الكامل" />
        </div>
        <div>
          <label htmlFor="phone" className="field-label">رقم الجوّال</label>
          <input id="phone" name="phone" required dir="ltr" inputMode="tel" defaultValue={defaultPhone} className="field-input text-left" placeholder="05xxxxxxxx" />
        </div>
      </div>

      {state.error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full text-base">
        {pending ? "جارٍ الانضمام…" : "انضم إلى قائمة الانتظار"}
      </button>
    </form>
  );
}
