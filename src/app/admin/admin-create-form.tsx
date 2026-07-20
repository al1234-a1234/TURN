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
        <div className="soft-card border-2 border-brand-500 p-5">
          <p className="text-sm font-bold text-brand-700 dark:text-brand-300">
            ✅ تم إنشاء المطعم بنجاح
          </p>
          {state.ok.linked ? (
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              تم ربط المالك بإيميله مباشرةً — يمكنه الدخول وإدارة مطعمه الآن.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-[color:var(--muted)]">
                سلّم صاحب المطعم هذا الرمز ليستلم مطعمه من صفحة «استلام مطعم»:
              </p>
              <p className="mt-3 select-all rounded-2xl bg-brand-600 py-4 text-center text-3xl font-extrabold tracking-[0.35em] text-white" dir="ltr">
                {state.ok.claim_code}
              </p>
            </>
          )}
          <p className="mt-3 text-xs text-[color:var(--muted)]" dir="ltr">
            /r/{state.ok.slug}
          </p>
        </div>
      )}

      <form action={formAction} className="soft-card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="field-label">اسم المطعم</label>
            <input id="name" name="name" required placeholder="مطعم دُور" className="field-input" />
          </div>
          <div>
            <label htmlFor="name_en" className="field-label">بالإنجليزية (اختياري)</label>
            <input id="name_en" name="name_en" dir="ltr" placeholder="Dour" className="field-input" />
          </div>
        </div>

        <div>
          <label htmlFor="slug" className="field-label">معرّف الرابط</label>
          <input
            id="slug"
            name="slug"
            required
            dir="ltr"
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))
            }
            placeholder="my-cafe"
            className="field-input"
          />
          <p className="mt-1.5 text-xs text-[color:var(--muted)]" dir="ltr">/r/{slug || "my-cafe"}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="branch_name" className="field-label">اسم الفرع</label>
            <input id="branch_name" name="branch_name" defaultValue="الفرع الرئيسي" className="field-input" />
          </div>
          <div>
            <label htmlFor="city" className="field-label">المدينة (اختياري)</label>
            <input id="city" name="city" placeholder="الرياض" className="field-input" />
          </div>
        </div>

        <div>
          <label htmlFor="owner_email" className="field-label">إيميل المالك (اختياري)</label>
          <input id="owner_email" name="owner_email" dir="ltr" inputMode="email" placeholder="owner@example.com" className="field-input" />
          <p className="mt-1.5 text-xs text-[color:var(--muted)]">
            إن كان صاحب المطعم لديه حساب بهذا الإيميل، سيُربط مالكًا مباشرةً. وإلا سيُنشأ رمز تسليم.
          </p>
        </div>

        {state.error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? "جارٍ الإنشاء…" : "إضافة مطعم"}
        </button>
      </form>
    </div>
  );
}
