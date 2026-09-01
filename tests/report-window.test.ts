/**
 * نافذة تقرير الأداء — حدودها ومرساتها وتنقّلها.
 *
 * الصفحة نفسها لا تُختبر بلا جلسة مالكٍ وقاعدةٍ حيّة، وحسابُ التواريخ أدقّ
 * ما فيها: خطأ يومٍ واحدٍ هنا يُزيح كل رقمٍ في التقرير بصمت — ولا شيء في
 * الشاشة يقول إنّ النافذة انزلقت. فالحساب مُخرَجٌ إلى `window.ts` ومُختبَرٌ
 * هنا بحدوده الحرفيّة، لا بوصفها.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPAN_DAYS,
  resolveAnchor,
  shiftDayKey,
  reportWindow,
  riyadhDayStartOf,
} from "../src/app/dashboard/reports/window";

/** نقطة الرياض الصفرية ليومٍ ما، كنصٍّ ISO — للمقارنة الحرفية. */
const RIYADH_MIDNIGHT_31_AUG = "2026-08-30T21:00:00.000Z"; // ٣١ أغسطس ٠٠:٠٠ +٣
const RIYADH_MIDNIGHT_01_SEP = "2026-08-31T21:00:00.000Z";

test("بداية اليوم بتوقيت الرياض = ٢١:٠٠ من اليوم السابق بتوقيت UTC", () => {
  assert.equal(riyadhDayStartOf("2026-08-31").toISOString(), RIYADH_MIDNIGHT_31_AUG);
  assert.equal(riyadhDayStartOf("2026-09-01").toISOString(), RIYADH_MIDNIGHT_01_SEP);
});

test("«يوم» لتاريخٍ ماضٍ = ذلك اليوم وحده، لا ما بعده", () => {
  const w = reportWindow("day", "2026-08-31");
  assert.equal(w.since, RIYADH_MIDNIGHT_31_AUG);
  assert.equal(w.until, RIYADH_MIDNIGHT_01_SEP);
  // ٢٤ ساعة بالضبط — لا ٢٣ ولا ٢٥ (لا توقيت صيفي في السعودية)
  assert.equal(w.anchorEnd.getTime() - w.sinceDate.getTime(), 864e5);
});

test("أطوال النوافذ لم تتغيّر عمّا كان يراه المالك", () => {
  assert.deepEqual(SPAN_DAYS, { day: 1, week: 7, month: 30, year: 365 });
  for (const [p, days] of Object.entries(SPAN_DAYS)) {
    const w = reportWindow(p as keyof typeof SPAN_DAYS, "2026-08-31");
    assert.equal(w.anchorEnd.getTime() - w.sinceDate.getTime(), days * 864e5, `طول نافذة ${p}`);
    // كلّها تنتهي عند نهاية يوم المرساة نفسه
    assert.equal(w.until, RIYADH_MIDNIGHT_01_SEP, `نهاية نافذة ${p}`);
  }
});

test("المرساة: التالف والمستقبل يسقطان على اليوم", () => {
  const today = "2026-09-01";
  assert.equal(resolveAnchor(undefined, today), today, "بلا وسيط = اليوم");
  assert.equal(resolveAnchor("", today), today, "فارغ = اليوم");
  assert.equal(resolveAnchor("غدًا", today), today, "نصٌّ تالف = اليوم");
  assert.equal(resolveAnchor("2026-13-45", today), "2026-13-45" > today ? today : "2026-13-45");
  assert.equal(resolveAnchor("2027-01-01", today), today, "المستقبل يُقصّ إلى اليوم");
  assert.equal(resolveAnchor("2026-08-31", today), "2026-08-31", "الماضي يُقبل كما هو");
});

test("التنقّل يخطو بطول الفترة ولا يُسقط يومًا ولا يُكرّره", () => {
  // يوم: خطوةٌ يوم
  assert.equal(shiftDayKey("2026-09-01", -1), "2026-08-31");
  assert.equal(shiftDayKey("2026-08-31", +1), "2026-09-01");
  // أسبوع: نافذتان متتاليتان تتلامسان بلا فجوةٍ ولا تداخل
  const cur = reportWindow("week", "2026-09-01");
  const prev = reportWindow("week", shiftDayKey("2026-09-01", -SPAN_DAYS.week));
  assert.equal(prev.until, cur.since, "نهاية السابقة = بداية الحالية بالضبط");
  // شهر: كذلك
  const mCur = reportWindow("month", "2026-09-01");
  const mPrev = reportWindow("month", shiftDayKey("2026-09-01", -SPAN_DAYS.month));
  assert.equal(mPrev.until, mCur.since);
});

test("عبور بداية الشهر والسنة لا ينكسر", () => {
  assert.equal(shiftDayKey("2026-09-01", -1), "2026-08-31", "أوّل الشهر ← آخر ما قبله");
  assert.equal(shiftDayKey("2026-01-01", -1), "2025-12-31", "أوّل السنة ← آخر ما قبلها");
  assert.equal(shiftDayKey("2026-03-01", -1), "2026-02-28", "٢٠٢٦ ليست كبيسة");
  assert.equal(shiftDayKey("2024-03-01", -1), "2024-02-29", "٢٠٢٤ كبيسة");
});

test("الرجوع ثمّ التقدّم يعود إلى نفس اليوم", () => {
  for (const p of Object.keys(SPAN_DAYS) as (keyof typeof SPAN_DAYS)[]) {
    const back = shiftDayKey("2026-09-01", -SPAN_DAYS[p]);
    assert.equal(shiftDayKey(back, +SPAN_DAYS[p]), "2026-09-01", `ذهابٌ وإيابٌ في ${p}`);
  }
});
