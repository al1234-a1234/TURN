"use client";

import { useActionState } from "react";
import { bulkProvision, type BulkState } from "./actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

const EMPTY: BulkState = {};

export function BulkForm() {
  const lang = useLang();
  const [state, action, pending] = useActionState(bulkProvision, EMPTY);

  const done = state.rows?.filter((r) => r.ok) ?? [];
  const failed = state.rows?.filter((r) => !r.ok) ?? [];

  // بطاقات الاعتماد نصًّا واحدًا: المالك ينسخها ويرسلها كما هي
  const creds = done
    .map((r) => `${r.name}\nالرابط: ei8ht.app/r/${r.slug}\nاسم الدخول: ${r.username}\nكلمة المرور: ${r.code}`)
    .join("\n\n");

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <label htmlFor="rows" className="field-label">
          {tr(lang, "سطر لكل مطعم", "One line per restaurant")}
        </label>
        <textarea
          id="rows"
          name="rows"
          rows={10}
          dir="ltr"
          required
          className="field-input font-mono text-[13px]"
          placeholder={"مطعم الضيافة, aldeyafa, aldeyafa, 0501234567, الرياض\nمطعم البيك, albaik, albaik, 0509876543, جدة"}
        />
        <p className="text-xs text-[color:var(--muted)]">
          {tr(
            lang,
            "الترتيب: الاسم، معرّف الرابط، اسم الدخول، الجوّال (اختياري)، المدينة (اختياري). الفاصلة أو التبويب يفصلان — فتقدر تلصق من جدول.",
            "Order: name, URL slug, username, phone (optional), city (optional). Comma or tab separated — paste straight from a spreadsheet.",
          )}
        </p>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? tr(lang, "جارٍ الإنشاء…", "Creating…") : tr(lang, "أنشئ الكل", "Create all")}
        </button>
      </form>

      {state.error ? (
        <p className="text-sm font-bold" style={{ color: "var(--danger)" }}>{state.error}</p>
      ) : null}

      {state.rows ? (
        <div className="space-y-3">
          <p className="text-sm font-bold">
            {tr(lang, "نجح", "Succeeded")} {done.length} · {tr(lang, "فشل", "Failed")} {failed.length}
          </p>

          {done.length > 0 ? (
            <div className="soft-card space-y-2 p-4">
              <p className="text-sm font-bold">{tr(lang, "بطاقات الاعتماد — انسخها الآن", "Credentials — copy them now")}</p>
              {/* كلمات المرور تُعرض مرّةً واحدة ولا تُخزَّن نصًّا في مكان: من
                  يغلق الصفحة قبل النسخ يحتاج إعادة تعيينها للمالك. */}
              <p className="text-xs text-[color:var(--muted)]">
                {tr(lang, "تُعرض مرّةً واحدة فقط. أغلقت الصفحة؟ تحتاج إعادة تعيين كلمة المرور.",
                    "Shown once only. Close the page and you'll need to reset the password.")}
              </p>
              <textarea readOnly dir="ltr" rows={Math.min(14, done.length * 4)}
                        value={creds} className="field-input font-mono text-[12px]" />
            </div>
          ) : null}

          {failed.length > 0 ? (
            <ul className="space-y-1">
              {failed.map((r, i) => (
                <li key={i} className="text-sm" style={{ color: "var(--danger)" }}>
                  <span dir="ltr">{r.slug || r.name}</span> — {r.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
