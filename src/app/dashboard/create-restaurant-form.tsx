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
  const [state, formAction, pending] = useActionState<
    CreateRestaurantState,
    FormData
  >(createRestaurant, {});
  const [slug, setSlug] = useState("");

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">أنشئ مطعمك</h1>
        <p className="mt-2 text-sm text-zinc-500">
          ابدأ بإضافة مطعمك وفرعه الأول — ستصبح مالكًا له مباشرةً.
        </p>
      </div>

      <form
        action={formAction}
        className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <fieldset className="space-y-4">
          <legend className="mb-2 text-sm font-semibold text-teal-700 dark:text-teal-400">
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

          <Field
            label="معرّف الرابط"
            htmlFor="slug"
            hint={`سيكون رابط مطعمك: /r/${slug || "my-cafe"}`}
          >
            <Input
              id="slug"
              name="slug"
              required
              dir="ltr"
              pattern="[a-z0-9\-]+"
              title="أحرف إنجليزية صغيرة وأرقام وشُرَط فقط"
              value={slug}
              onChange={(e) =>
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-")
                    .replace(/-+/g, "-"),
                )
              }
              placeholder="my-cafe"
            />
          </Field>

          <Field label="هاتف المطعم (اختياري)" htmlFor="phone">
            <Input id="phone" name="phone" dir="ltr" inputMode="tel" placeholder="+9665xxxxxxxx" />
          </Field>
        </fieldset>

        <fieldset className="space-y-4 border-t border-zinc-100 pt-5 dark:border-zinc-800">
          <legend className="mb-2 text-sm font-semibold text-teal-700 dark:text-teal-400">
            الفرع الأول
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم الفرع" htmlFor="branch_name">
              <Input
                id="branch_name"
                name="branch_name"
                required
                defaultValue="الفرع الرئيسي"
              />
            </Field>
            <Field label="المدينة (اختياري)" htmlFor="city">
              <Input id="city" name="city" placeholder="الرياض" />
            </Field>
          </div>

          <Field label="العنوان (اختياري)" htmlFor="address">
            <Input id="address" name="address" placeholder="الحي، الشارع" />
          </Field>

          <Field label="المنطقة الزمنية" htmlFor="timezone">
            <select
              id="timezone"
              name="timezone"
              defaultValue="Asia/Riyadh"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </Field>
        </fieldset>

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
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-zinc-400" dir="ltr">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-900"
    />
  );
}
