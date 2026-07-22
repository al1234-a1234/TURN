"use client";

import { useActionState, useMemo, useState } from "react";
import { joinWaitlistGuest, type WaitlistState } from "./actions";
import { QueueTicket } from "./queue-ticket";
import { toAr, waitMinutes } from "@/lib/format";

type Branch = { id: string; name: string; total: number; inside: number; outside: number };

export function WaitlistForm({
  slug,
  branches,
  accepts,
  defaultName,
  defaultPhone,
}: {
  slug: string;
  branches: Branch[];
  accepts: boolean;
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

  // مغلق / لا يستقبل الآن
  if (!accepts) {
    return (
      <div className="rq-card p-7 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(192,86,74,0.12)", color: "var(--st-closed)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </span>
        <p className="text-lg font-bold text-[color:var(--ink)]">لا يستقبل طلبات الانتظار الآن</p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">المطعم متوقف مؤقتًا عن استقبال الطابور.</p>
        <button className="rq-btn-soft mt-5">أخبرني عندما يفتح الاستقبال</button>
      </div>
    );
  }

  const total = branch?.total ?? 0;
  const eta = waitMinutes(total);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="branch_id" value={branchId} />

      {/* حالة الطابور بصياغة نفسية واضحة */}
      <div className="rq-card p-6 text-center">
        {total > 0 ? (
          <>
            <p className="font-display text-5xl font-bold text-brand-700 leading-none">{toAr(total)}</p>
            <p className="mt-2 text-sm font-bold text-[color:var(--ink)]">في الطابور الآن</p>
            <p className="mt-1 text-sm text-[color:var(--muted)]">تقدير دخولك بعد ~{toAr(eta)} دقيقة</p>
          </>
        ) : (
          <>
            <p className="font-display text-2xl font-bold" style={{ color: "var(--st-open)" }}>متاح الآن</p>
            <p className="mt-1 text-sm text-[color:var(--muted)]">لا يوجد انتظار — سجّل وكن أول الطابور</p>
          </>
        )}
      </div>

      {branches.length > 1 && (
        <div className="rq-card p-5">
          <label className="field-label">الفرع</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="field-input">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* اسم + رقم */}
      <div className="rq-card space-y-4 p-5">
        <div className="text-right">
          <p className="font-display text-lg font-bold text-[color:var(--ink)]">سجّل بياناتك وخذ دورك</p>
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--sage)] px-3 py-1 text-xs font-bold text-brand-800">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            بلا حساب ولا كلمة مرور
          </span>
        </div>
        <div>
          <label htmlFor="full_name" className="field-label">الاسم</label>
          <input id="full_name" name="full_name" required defaultValue={defaultName} className="field-input" placeholder="اكتب اسمك" />
        </div>
        <div>
          <label htmlFor="phone" className="field-label">رقم الجوّال</label>
          <input id="phone" name="phone" required dir="ltr" inputMode="tel" defaultValue={defaultPhone} className="field-input text-left" placeholder="05xxxxxxxx" />
        </div>
      </div>

      {state.error && (
        <p className="rounded-2xl border border-[rgba(200,70,70,0.3)] bg-[rgba(200,70,70,0.06)] px-4 py-3 text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="rq-btn">
        {pending ? "جارٍ التسجيل…" : "خذ دورك الآن"}
      </button>
    </form>
  );
}
