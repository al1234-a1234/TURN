"use client";

import { useActionState, useEffect, useState } from "react";
import { adminCreateRestaurant, type AdminCreateState } from "./actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

export function AdminCreateForm() {
  const lang = useLang();
  const [state, formAction, pending] = useActionState<AdminCreateState, FormData>(
    adminCreateRestaurant,
    {},
  );
  const [slug, setSlug] = useState("");
  // اسم المستخدم يُقترح محايدًا (ow + أرقام) لا مشتقًّا من اسم المطعم:
  // «eficto-rec» على شاشة دخول الاستقبال أعلن للواقفين أمامها لمن تعود —
  // ملاحظة المشغّل نصًّا. التوليد بعد الترطيب كي لا يختلف الخادم عن المتصفّح.
  const [username, setUsername] = useState("");
  useEffect(() => {
    setUsername((cur) => cur || `ow${Math.floor(1000 + Math.random() * 9000)}`);
  }, []);

  return (
    <div className="space-y-4">
      {state.ok && (
        <div className="soft-card p-5" style={{ borderColor: "rgba(201,169,97,0.5)" }}>
          <p className="font-serif text-lg font-bold text-[color:var(--gold-1)]">{tr(lang, "✅ تم إنشاء حساب المالك", "✅ Owner account created")}</p>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            {tr(lang, "سلّم صاحب المطعم هذه البيانات ليدخل من بوابة الشركاء ", "Give the restaurant owner these credentials to sign in from the partners portal ")}<span dir="ltr">/partners</span>:
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Cred label={tr(lang, "مُعرّف المطعم", "Restaurant ID")} value={state.ok.slug} />
            <Cred label={tr(lang, "اسم المستخدم", "Username")} value={state.ok.username} />
            <Cred label={tr(lang, "كلمة المرور", "Password")} value={state.ok.code} />
          </div>
          {state.ok.phone && (
            <p className="mt-3 text-xs text-[color:var(--muted)]" dir="ltr">📱 {state.ok.phone}</p>
          )}
        </div>
      )}

      <form action={formAction} className="soft-card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="field-label">{tr(lang, "اسم المطعم", "Restaurant name")}</label>
            <input id="name" name="name" required placeholder={tr(lang, "مطعم الضيافة", "Hospitality Restaurant")} className="field-input" />
          </div>
          <div>
            <label htmlFor="slug" className="field-label">{tr(lang, "معرّف الرابط", "URL slug")}</label>
            <input
              id="slug" name="slug" required dir="ltr" value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-+/, ""))}
              onBlur={(e) => setSlug(e.target.value.replace(/-+$/, ""))}
              placeholder="my-cafe" className="field-input"
            />
          </div>
        </div>

        <div className="gold-rule my-1" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="username" className="field-label">{tr(lang, "اسم مستخدم المالك", "Owner username")}</label>
            <input
              id="username" name="username" required dir="ltr" value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="field-input"
            />
            <p className="mt-1 text-[11px] text-[color:var(--muted)]">
              {tr(lang, "محايد عمدًا — لا تجعل اسم المطعم جزءًا منه: يظهر على شاشات الدخول.", "Deliberately neutral — don't include the restaurant name: it shows on login screens.")}
            </p>
          </div>
          <div>
            <label htmlFor="phone" className="field-label">{tr(lang, "جوال المالك", "Owner phone")}</label>
            <input id="phone" name="phone" dir="ltr" inputMode="tel" placeholder="05xxxxxxxx" className="field-input" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="city" className="field-label">{tr(lang, "المدينة (اختياري)", "City (optional)")}</label>
            <input id="city" name="city" placeholder={tr(lang, "الرياض", "Riyadh")} className="field-input" />
          </div>
          <div>
            <label htmlFor="branch_name" className="field-label">{tr(lang, "اسم الفرع", "Branch name")}</label>
            <input id="branch_name" name="branch_name" defaultValue={tr(lang, "الفرع الرئيسي", "Main branch")} className="field-input" />
          </div>
        </div>

        <p className="text-xs text-[color:var(--muted)]">
          {tr(lang, "يُنشأ للمالك حساب خاص ورمز دخول تلقائيًا — لا يستطيع أحد التسجيل بنفسه.", "A private account and login code are created for the owner automatically — no one can register on their own.")}
        </p>

        {state.error && (
          <p className="rounded-xl border border-[rgba(200,70,70,0.3)] bg-[rgba(200,70,70,0.06)] px-4 py-3 text-sm font-medium text-[color:var(--danger)]">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? tr(lang, "جارٍ الإنشاء…", "Creating…") : tr(lang, "إنشاء مطعم + حساب مالك", "Create restaurant + owner account")}
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
