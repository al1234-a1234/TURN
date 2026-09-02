import { riyadhDayStart, riyadhISODate } from "@/lib/dates";

/**
 * نافذة تقرير الأداء — الحساب وحده، بلا React ولا قاعدة.
 *
 * أُخرج من `page.tsx` لسببين: أوّلهما أن الصفحة لا تُختبر إلّا بجلسة مالكٍ
 * وقاعدةٍ حيّة، فبقي حسابُ التواريخ — وهو أدقّ ما فيها — بلا اختبار؛
 * وثانيهما أنّ كل رقمٍ في التقرير يتفرّع عن هذه الحدود، فخطأ يومٍ واحد
 * هنا يُزيح التقرير كلّه بصمت.
 */

export const PERIODS = ["day", "week", "month", "year"] as const;
export type Period = (typeof PERIODS)[number];

/**
 * كم يومًا تغطّي كل فترة، والمرساة آخرها. «شهر» ٣٠ يومًا و«سنة» ٣٦٥ — نفس
 * أطوال النوافذ التي كانت الصفحة تحسبها من `Date.now()` مباشرة، كي لا
 * يتغيّر رقمٌ يراه المالك اليوم لمجرّد أنّنا أضفنا تنقّلًا.
 */
export const SPAN_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30, year: 365 };

/** بداية يومٍ بتوقيت الرياض من مفتاح `YYYY-MM-DD` — والتالف يسقط على اليوم. */
export function riyadhDayStartOf(key: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return riyadhDayStart();
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 3 * 3600_000;
  return Number.isFinite(t) ? new Date(t) : riyadhDayStart();
}

/** إزاحة مفتاح يومٍ بعددٍ من الأيام (سالبٌ للخلف) — يبقى بتوقيت الرياض. */
export function shiftDayKey(key: string, days: number): string {
  return riyadhISODate(new Date(riyadhDayStartOf(key).getTime() + days * 864e5));
}

/**
 * المرساة الفعّالة: مفتاحٌ سليم لا يتجاوز اليوم.
 *
 * التالف يسقط على اليوم، والمستقبل يُقصّ إليه — تقريرٌ عن غدٍ صفرٌ يُقرأ
 * «يومٌ فاشل» لا «يومٌ لم يأتِ».
 */
export function resolveAnchor(dateParam: string | undefined, todayKey = riyadhISODate()): string {
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? (dateParam as string) : todayKey;
  return raw > todayKey ? todayKey : raw;
}

export type ReportWindow = {
  /** بداية يوم المرساة (آخر أيام النافذة) */
  anchorStart: Date;
  /** نهاية يوم المرساة — حصريّة */
  anchorEnd: Date;
  /** أوّل لحظةٍ داخل النافذة — شاملة */
  sinceDate: Date;
  since: string;
  until: string;
};

/**
 * حدود النافذة: محاذيةٌ لليوم، منتهيةٌ عند المرساة، طولها `SPAN_DAYS`.
 *
 * المحاذاة لليوم ليست تجميلًا: رسمُ «الأسبوع» كان يعرض ٧ أيامٍ كاملة بينما
 * تعدّ المؤشّرات فوقه ١٦٨ ساعةً متدحرجة من اللحظة الراهنة — فيختلف مجموع
 * الأعمدة عن الرقم فوقها في نفس الصفحة.
 */
export function reportWindow(period: Period, anchor: string): ReportWindow {
  const anchorStart = riyadhDayStartOf(anchor);
  const anchorEnd = new Date(anchorStart.getTime() + 864e5);
  const sinceDate = new Date(anchorEnd.getTime() - SPAN_DAYS[period] * 864e5);
  return {
    anchorStart,
    anchorEnd,
    sinceDate,
    since: sinceDate.toISOString(),
    until: anchorEnd.toISOString(),
  };
}
