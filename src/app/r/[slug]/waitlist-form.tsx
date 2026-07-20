"use client";

import { useActionState, useMemo, useState } from "react";
import { joinWaitlistGuest, type WaitlistState } from "./actions";

type Branch = {
  id: string;
  name: string;
  total: number;
  inside: number;
  outside: number;
};

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
    joinWaitlistGuest,
    { ok: false },
  );

  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const branch = useMemo(
    () => branches.find((b) => b.id === branchId) ?? branches[0],
    [branchId, branches],
  );

  if (state.ok) {
    return (
      <div className="soft-card flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-600 text-4xl font-extrabold text-white shadow-[var(--shadow-lift)]">
          #{state.position ?? "—"}
        </span>
        <p className="text-xl font-extrabold text-brand-800 dark:text-cream-100">
          تم تسجيلك في الطابور
        </p>
        <p className="text-sm text-[color:var(--muted)]">
          رقم دورك {state.position ?? "—"}. احتفظ بالصفحة وتابع تقدّم الطابور.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="branch_id" value={branchId} />

      {/* عدّاد الطابور الحيّ */}
      <div className="soft-card flex items-center justify-between p-6">
        <div>
          <p className="text-sm text-[color:var(--muted)]">في الطابور الآن</p>
          <p className="text-4xl font-extrabold text-brand-700 dark:text-brand-300">
            {branch?.total ?? 0}
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
          خذ دورك
        </span>
      </div>

      {branches.length > 1 && (
        <div className="soft-card p-5">
          <label className="field-label">الفرع</label>
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

      {/* اسم + رقم فقط */}
      <div className="soft-card space-y-4 p-5">
        <div>
          <label htmlFor="full_name" className="field-label">الاسم</label>
          <input
            id="full_name" name="full_name" required defaultValue={defaultName}
            className="field-input" placeholder="اكتب اسمك"
          />
        </div>
        <div>
          <label htmlFor="phone" className="field-label">رقم الجوّال</label>
          <input
            id="phone" name="phone" required dir="ltr" inputMode="tel"
            defaultValue={defaultPhone} className="field-input text-left" placeholder="05xxxxxxxx"
          />
        </div>
      </div>

      {state.error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full text-base">
        {pending ? "جارٍ التسجيل…" : "خذ دورك الآن"}
      </button>
    </form>
  );
}
