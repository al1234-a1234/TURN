"use client";

import { useActionState, useState } from "react";
import { createStaffAccount, resetStaffCode, type ProvisionState } from "./provision-actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

/** بطاقة بيانات الدخول — كل قيمة في صندوق مستقل ليُنسخ وحده. */
function Credentials({ username, code, onDone }: { username: string; code: string; onDone: () => void }) {
  const lang = useLang();
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface-2)", border: "1px solid rgba(102,28,10,0.18)" }}>
      <p className="mb-3 font-display text-base font-bold" style={{ color: "var(--brand-d)" }}>
        ✅ {tr(lang, "جاهز — سلّمه هذه البيانات", "Ready — hand over these details")}
      </p>
      <p className="mb-1 text-xs font-bold text-[color:var(--muted)]">{tr(lang, "اسم المستخدم", "Username")}</p>
      <p className="mb-3 select-all rounded-xl bg-white px-3 py-2.5 font-mono text-lg font-bold" dir="ltr">{username}</p>
      <p className="mb-1 text-xs font-bold text-[color:var(--muted)]">{tr(lang, "الرمز", "Code")}</p>
      <p className="mb-3 select-all rounded-xl bg-white px-3 py-2.5 font-mono text-lg font-bold tracking-widest" dir="ltr">{code}</p>
      <p className="mb-3 text-xs font-bold" style={{ color: "#9a6a4c" }}>
        ⚠️ {tr(lang, "الرمز لن يظهر مرة أخرى — انسخه الآن. يدخل من صفحة /reception", "The code won't be shown again — copy it now. They sign in at /reception")}
      </p>
      <button type="button" onClick={onDone} className="btn btn-secondary w-full">{tr(lang, "تم", "Done")}</button>
    </div>
  );
}

/** إنشاء حساب موظّف — المالك يجهّز فريقه بنفسه بلا انتظار إدارة المنصّة. */
export function StaffProvision({
  restaurantId,
  branches,
}: {
  restaurantId: string;
  branches: { id: string; name: string }[];
}) {
  const lang = useLang();
  const [state, action, pending] = useActionState<ProvisionState, FormData>(createStaffAccount, {});
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return <Credentials username={state.ok.username} code={state.ok.code} onDone={() => location.reload()} />;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary w-full">
        ➕ {tr(lang, "إضافة موظّف استقبال", "Add reception staff")}
      </button>
    );
  }

  return (
    <form action={action} className="soft-card space-y-3 p-5">
      <input type="hidden" name="restaurant_id" value={restaurantId} />
      <p className="font-display text-base font-bold text-[color:var(--ink)]">{tr(lang, "موظّف جديد", "New staff member")}</p>

      <div>
        <label className="field-label">{tr(lang, "الاسم (يظهر لك فقط)", "Name (shown to you only)")}</label>
        <input name="name" className="field-input" placeholder={tr(lang, "مثال: أحمد", "e.g. Ahmed")} />
      </div>

      <div>
        <label className="field-label">{tr(lang, "اسم المستخدم للدخول", "Login username")}</label>
        <input name="username" required dir="ltr" className="field-input text-left" placeholder="eficto-rec2" />
        <p className="mt-1 text-[11px] text-[color:var(--muted)]">{tr(lang, "أحرف إنجليزية صغيرة وأرقام وشُرَط فقط", "Lowercase letters, numbers and dashes only")}</p>
      </div>

      {branches.length > 1 && (
        <div>
          <label className="field-label">{tr(lang, "الفرع", "Branch")}</label>
          <select name="branch_id" className="field-input" defaultValue={branches[0]?.id}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-[color:var(--muted)]">{tr(lang, "سيرى هذا الفرع فقط", "They will see only this branch")}</p>
        </div>
      )}
      {branches.length === 1 && <input type="hidden" name="branch_id" value={branches[0].id} />}

      <div>
        <label className="field-label">{tr(lang, "الصلاحيات", "Permissions")}</label>
        <select name="preset" className="field-input" defaultValue="reception">
          <option value="reception">{tr(lang, "استقبال — الطابور فقط", "Reception — queue only")}</option>
          <option value="reception_plus">{tr(lang, "استقبال+ — الطابور والحجوزات والعملاء", "Reception+ — queue, reservations, customers")}</option>
          <option value="manager">{tr(lang, "مشرف — كل شيء عدا الإعدادات", "Supervisor — everything except settings")}</option>
        </select>
      </div>

      {state.error && (
        <p className="rounded-2xl border border-[rgba(200,70,70,0.3)] bg-[rgba(200,70,70,0.06)] px-3 py-2.5 text-sm font-medium text-red-600">{state.error}</p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? tr(lang, "جارٍ الإنشاء…", "Creating…") : tr(lang, "أنشئ الحساب", "Create account")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">{tr(lang, "إلغاء", "Cancel")}</button>
      </div>
    </form>
  );
}

/** إعادة ضبط رمز موظّف نسي رمزه. */
export function ResetCode({ staffId }: { staffId: string }) {
  const lang = useLang();
  const [state, action, pending] = useActionState<ProvisionState, FormData>(resetStaffCode, {});

  if (state.ok) {
    return <div className="mt-3"><Credentials username={state.ok.username} code={state.ok.code} onDone={() => location.reload()} /></div>;
  }

  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="staff_id" value={staffId} />
      {state.error && <p className="mb-2 text-xs font-bold text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="text-xs font-bold text-[color:var(--muted)] underline-offset-2 hover:text-brand-700 hover:underline">
        {pending ? tr(lang, "جارٍ…", "Working…") : tr(lang, "🔑 إعادة ضبط الرمز", "🔑 Reset code")}
      </button>
    </form>
  );
}
