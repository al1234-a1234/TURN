"use client";

import { useActionState, useState } from "react";
import { adminCreateRestaurant, type AdminCreateState } from "./actions";

export function AdminCreateForm() {
  const [state, formAction, pending] = useActionState<AdminCreateState, FormData>(
    adminCreateRestaurant,
    {},
  );
  const [slug, setSlug] = useState("");

  return (
    <div className="space-y-4">
      {state.ok && (
        <div className="soft-card p-5" style={{ borderColor: "rgba(201,169,97,0.5)" }}>
          <p className="font-serif text-lg font-bold text-[color:var(--gold-1)]">✅ تم إنشاء حساب المالك</p>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            سلّم صاحب المطعم هذه البيانات ليدخل من صفحة الدخول:
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Cred label="اسم المستخدم" value={state.ok.username} />
            <Cred label="الرمز" value={state.ok.code} />
            <Cred label="الجوال" value={state.ok.phone || "—"} />
          </div>
          <p className="mt-3 text-xs text-[color:var(--muted)]" dir="ltr">/r/{state.ok.slug}</p>
        </div>
      )}

      <form action={formAction} className="soft-card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="field-label">اسم المطعم</label>
            <input id="name" name="name" required placeholder="مطعم الضيافة" className="field-input" />
          </div>
          <div>
            <label htmlFor="slug" className="field-label">معرّف الرابط</label>
            <input
              id="slug" name="slug" required dir="ltr" value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))}
              placeholder="my-cafe" className="field-input"
            />
          </div>
        </div>

        <div className="gold-rule my-1" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="username" className="field-label">اسم مستخدم المالك</label>
            <input id="username" name="username" required dir="ltr" placeholder="aldeyafa" className="field-input" />
          </div>
          <div>
            <label htmlFor="phone" className="field-label">جوال المالك</label>
            <input id="phone" name="phone" dir="ltr" inputMode="tel" placeholder="05xxxxxxxx" className="field-input" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="city" className="field-label">المدينة (اختياري)</label>
            <input id="city" name="city" placeholder="الرياض" className="field-input" />
          </div>
          <div>
            <label htmlFor="branch_name" className="field-label">اسم الفرع</label>
            <input id="branch_name" name="branch_name" defaultValue="الفرع الرئيسي" className="field-input" />
          </div>
        </div>

        <p className="text-xs text-[color:var(--muted)]">
          يُنشأ للمالك حساب خاص ورمز دخول تلقائيًا — لا يستطيع أحد التسجيل بنفسه.
        </p>

        {state.error && (
          <p className="rounded-xl border border-[rgba(220,90,90,0.35)] bg-[color:var(--surface)] px-4 py-3 text-sm font-medium text-red-300">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? "جارٍ الإنشاء…" : "إنشاء مطعم + حساب مالك"}
        </button>
      </form>
    </div>
  );
}

function Cred({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--hairline)] bg-[rgba(12,23,18,0.5)] p-3 text-center">
      <p className="text-xs text-[color:var(--muted)]">{label}</p>
      <p className="select-all font-serif text-lg font-bold tracking-widest text-[color:var(--ink)]" dir="ltr">{value}</p>
    </div>
  );
}
