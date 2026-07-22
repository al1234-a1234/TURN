"use client";

import { useActionState, useMemo, useState } from "react";
import { joinWaitlistGuest, type WaitlistState } from "./actions";
import { QueueTicket } from "./queue-ticket";

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
      <QueueTicket
        position={state.position ?? 0}
        total={state.total ?? 0}
        entryId={state.entryId}
        phone={state.phone}
      />
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
          <p className="font-display text-5xl font-bold text-brand-700 leading-tight">{branch?.total ?? 0}</p>
        </div>
        <span className="chip">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
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
          <p className="font-display text-lg font-bold text-[color:var(--ink)]">سجّل بياناتك وخذ دورك</p>
          <p className="text-xs text-[color:var(--muted)]">اسمك ورقمك فقط — بلا حساب ولا كلمة مرور.</p>
        </div>
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
        <p className="rounded-2xl border border-[rgba(200,70,70,0.3)] bg-[rgba(200,70,70,0.06)] px-4 py-3 text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full text-base">
        {pending ? "جارٍ التسجيل…" : "خذ دورك الآن"}
      </button>
    </form>
  );
}
