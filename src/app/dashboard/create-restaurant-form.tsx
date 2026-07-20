"use client";

import { useActionState, useState } from "react";
import { createRestaurant, type CreateRestaurantState } from "./actions";

const TIMEZONES = [
  { value: "Asia/Riyadh", label: "الرياض (GMT+3)" },
  { value: "Asia/Dubai", label: "دبي / أبوظبي (GMT+4)" },
  { value: "Asia/Kuwait", label: "الكويت (GMT+3)" },
  { value: "Asia/Qatar", label: "الدوحة (GMT+3)" },
  { value: "Asia/Bahrain", label: "المنامة (GMT+3)" },
  { value: "Africa/Cairo", label: "القاهرة (GMT+2)" },
];

export function CreateRestaurantForm() {
  const [state, formAction, pending] = useActionState<CreateRestaurantState, FormData>(
    createRestaurant,
    {},
  );
  const [slug, setSlug] = useState("");

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-8 text-center">
        <span className="eyebrow mb-4">الخطوة الأخيرة</span>
        <h1 className="text-3xl font-extrabold text-brand-900 dark:text-white">أنشئ مطعمك</h1>
        <p className="mt-3 text-stone-500">
          أضف مطعمك وفرعك الأول — ستصبح مالكًا له مباشرةً وتبدأ باستقبال الحجوزات.
        </p>
      </div>

      <form action={formAction} className="soft-card space-y-6 p-7">
        <fieldset className="space-y-4">
          <legend className="mb-1 text-sm font-bold text-brand-700 dark:text-brand-300">
            بيانات المطعم
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم المطعم" htmlFor="name">
              <Input id="name" name="name" required placeholder="مثال: مطعم دُور" />
            </Field>
            <Field label="الاسم بالإنجليزية (اختياري)" htmlFor="name_en">
              <Input id="name_en" name="name_en" dir="ltr" placeholder="Dour" />
            </Field>
          </div>

          <Field label="معرّف الرابط" htmlFor="slug" hint={`رابط مطعمك: /r/${slug || "my-cafe"}`}>
            <Input
              id="slug"
              name="slug"
              required
              dir="ltr"
              pattern="[a-z0-9\-]+"
              title="أحرف إنجليزية صغيرة وأرقام وشُرَط فقط"
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))
              }
              placeholder="my-cafe"
            />
          </Field>

          <Field label="هاتف المطعم (اختياري)" htmlFor="phone">
            <Input id="phone" name="phone" dir="ltr" inputMode="tel" placeholder="+9665xxxxxxxx" />
          </Field>
        </fieldset>

        <fieldset className="space-y-4 border-t border-[var(--border)] pt-6">
          <legend className="mb-1 text-sm font-bold text-brand-700 dark:text-brand-300">
            الفرع الأول
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم الفرع" htmlFor="branch_name">
              <Input id="branch_name" name="branch_name" required defaultValue="الفرع الرئيسي" />
            </Field>
            <Field label="المدينة (اختياري)" htmlFor="city">
              <Input id="city" name="city" placeholder="الرياض" />
            </Field>
          </div>

          <Field label="العنوان (اختياري)" htmlFor="address">
            <Input id="address" name="address" placeholder="الحي، الشارع" />
          </Field>

          <Field label="المنطقة الزمنية" htmlFor="timezone">
            <select id="timezone" name="timezone" defaultValue="Asia/Riyadh" className="field-input">
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </Field>
        </fieldset>

        {state.error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? "جارٍ الإنشاء…" : "إنشاء المطعم والفرع"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="field-label">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-stone-400" dir="ltr">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="field-input" />;
}
