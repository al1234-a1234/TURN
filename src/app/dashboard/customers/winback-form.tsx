"use client";

import { useState, useTransition } from "react";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { toAr } from "@/lib/format";
import { saveWinback } from "./actions";

/**
 * هدية الاسترجاع — البديل الوحيد الباقي من منظومة الولاء.
 *
 * كانت تسكن صفحة «الولاء» مع النقاط والعتبات، وسقطت معها. مكانها هنا:
 * الاسترجاع منح هدية لعميل غاب، فيسكن حيث تُمنح الهدايا.
 *
 * يعمل من نفسه كل ليلة: من تجاوز غيابه المدّة المضبوطة تصله هدية، ولا
 * تتكرّر عليه قبل ٦٠ يومًا كي لا تتحوّل إلى إزعاج.
 */
export function WinbackForm({
  initial,
}: {
  initial: { is_active: boolean; title: string; value: number | null; value_kind: string; days_inactive: number } | null;
}) {
  const lang = useLang();
  const [on, setOn] = useState(initial?.is_active ?? false);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const field = "field-input";

  return (
    <form
      action={(fd) => start(async () => { await saveWinback(fd); setSaved(true); setTimeout(() => setSaved(false), 1800); })}
      className="soft-card p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-[color:var(--ink)]">
            💌 {tr(lang, "هدية استرجاع تلقائية", "Automatic win-back gift")}
          </p>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">
            {tr(lang, "من غاب عنك هذه المدّة تصله هدية من نفسها — مرّة كل ٦٠ يومًا على الأكثر.",
                      "Anyone away this long gets a gift automatically — at most once every 60 days.")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={tr(lang, "تفعيل الاسترجاع التلقائي", "Enable automatic win-back")}
          onClick={() => setOn((v) => !v)}
          className="relative h-7 w-14 shrink-0 rounded-full transition-colors"
          style={{ background: on ? "var(--brand-solid)" : "var(--surface-2)" }}
        >
          <span
            className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-[color:var(--surface)] shadow transition-all"
            style={{ insetInlineStart: on ? "1.95rem" : "0.2rem" }}
          />
        </button>
      </div>
      <input type="hidden" name="is_active" value={on ? "1" : "0"} />

      {on && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="field-label" htmlFor="wb-title">{tr(lang, "عنوان الهدية", "Gift title")}</label>
            <input
              id="wb-title"
              name="title"
              defaultValue={initial?.title ?? "اشتقنا لك — هدية عودة 🎁"}
              maxLength={80}
              className={field}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="wb-days">{tr(lang, "بعد كم يوم غياب؟", "After how many days away?")}</label>
              <input
                id="wb-days"
                name="days_inactive"
                inputMode="numeric"
                defaultValue={initial?.days_inactive ?? 30}
                className={field}
                dir="ltr"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="wb-value">{tr(lang, "نسبة خصم ٪ (اختياري)", "Discount % (optional)")}</label>
              <input
                id="wb-value"
                name="value"
                inputMode="numeric"
                defaultValue={initial?.value ?? ""}
                placeholder={tr(lang, "اتركه فارغًا = هدية", "Leave empty = gift")}
                className={field}
                dir="ltr"
              />
            </div>
          </div>

          <p className="text-[11px] font-bold text-[color:var(--muted)]">
            {tr(lang, `المدّة المسموحة من ${toAr(7)} إلى ${toAr(365)} يومًا.`, "Allowed range: 7 to 365 days.")}
          </p>
        </div>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary mt-4 w-full">
        {pending ? "…" : saved ? tr(lang, "حُفظ ✓", "Saved ✓") : tr(lang, "حفظ", "Save")}
      </button>
    </form>
  );
}
