/** اختبارات توقيت الرياض — الثوابت التي انكسرت سابقًا يجب ألّا تنكسر مجددًا. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { riyadhHour, riyadhDayKey, riyadhWeekday, riyadhDayStart, TZ } from "../src/lib/dates.ts";

test("riyadhHour: UTC+3 دائمًا (لا توقيت صيفي في السعودية)", () => {
  assert.equal(riyadhHour("2026-07-26T04:24:00Z"), 7);   // الحالة الحقيقية التي كُشفت
  assert.equal(riyadhHour("2026-07-26T21:00:00Z"), 0);   // منتصف الليل بالرياض
  assert.equal(riyadhHour("2026-07-26T23:30:00Z"), 2);
});

test("riyadhDayKey: ما قبل ٩ مساءً UTC ينتمي لليوم نفسه، وما بعدها لليوم التالي بالرياض", () => {
  assert.equal(riyadhDayKey("2026-07-26T20:59:00Z"), riyadhDayKey("2026-07-26T00:00:00Z"));
  assert.notEqual(riyadhDayKey("2026-07-26T21:01:00Z"), riyadhDayKey("2026-07-26T20:59:00Z"));
});

test("riyadhDayStart: بداية اليوم = 21:00 UTC لليوم السابق، وdaysAgo يتراجع 24 ساعة", () => {
  const start = riyadhDayStart();
  assert.equal(start.getUTCHours(), 21);
  assert.equal(start.getUTCMinutes(), 0);
  const yesterday = riyadhDayStart(1);
  assert.equal(start.getTime() - yesterday.getTime(), 24 * 3600_000);
});

test("riyadhWeekday: يتقدّم يومًا بعد منتصف الليل بالرياض", () => {
  const beforeMidnight = riyadhWeekday("2026-07-26T20:30:00Z"); // الأحد مساءً بالرياض
  const afterMidnight  = riyadhWeekday("2026-07-26T21:30:00Z"); // الإثنين 00:30 بالرياض
  assert.equal((beforeMidnight + 1) % 7, afterMidnight);
});

test("TZ ثابت على الرياض", () => { assert.equal(TZ, "Asia/Riyadh"); });

/* دوام الأيام المختلفة (0121) — نفس بطارية اختبارات دالة القاعدة
   branch_open_by_hours حرفيًّا (المنطق مكرَّرٌ على الطرفين عمدًا، فأي
   انحرافٍ بينهما يظهر هنا). الدالة تقرأ الوقت الحالي، فيُثبَّت Date.now
   على لحظاتٍ معلومة: 2026-08-26 أربعاء، 28 جمعة، 29 سبت (بالرياض). */
import { isWithinOpeningHours } from "../src/lib/dates.ts";

function atRiyadh(iso: string, fn: () => void) {
  const real = Date.now;
  Date.now = () => new Date(iso).getTime();
  try { fn(); } finally { Date.now = real; }
}

test("دوام عام وحده: داخل النطاق مفتوح وخارجه مغلق", () => {
  const h = { open: "16:00", close: "23:00" };
  atRiyadh("2026-08-26T17:00:00+03:00", () => assert.equal(isWithinOpeningHours(h), true));
  atRiyadh("2026-08-26T15:00:00+03:00", () => assert.equal(isWithinOpeningHours(h), false));
});

test("نطاق ليلي عام (18-02): فجرًا مفتوح، بعد القفل مغلق، مساءً مفتوح", () => {
  const h = { open: "18:00", close: "02:00" };
  atRiyadh("2026-08-26T01:00:00+03:00", () => assert.equal(isWithinOpeningHours(h), true));
  atRiyadh("2026-08-26T03:00:00+03:00", () => assert.equal(isWithinOpeningHours(h), false));
  atRiyadh("2026-08-26T19:00:00+03:00", () => assert.equal(isWithinOpeningHours(h), true));
});

test("استثناء الجمعة يفتح أبكر، وبقية الأيام على العام", () => {
  const h = { open: "16:00", close: "23:00", days: { "5": { open: "14:00", close: "23:00" } } };
  atRiyadh("2026-08-28T15:00:00+03:00", () => assert.equal(isWithinOpeningHours(h), true));   // جمعة 15:00
  atRiyadh("2026-08-26T15:00:00+03:00", () => assert.equal(isWithinOpeningHours(h), false));  // أربعاء 15:00
});

test("ذيل ليل الجمعة يمتدّ إلى فجر السبت بجدول الجمعة لا السبت", () => {
  const h = { open: "16:00", close: "23:00", days: { "5": { open: "20:00", close: "03:00" } } };
  atRiyadh("2026-08-29T02:00:00+03:00", () => assert.equal(isWithinOpeningHours(h), true));   // سبت 02:00
  atRiyadh("2026-08-29T04:00:00+03:00", () => assert.equal(isWithinOpeningHours(h), false));  // سبت 04:00
});

test("بلا ساعات أو بقيمة تالفة أو يومٍ بلا دوام = مفتوح", () => {
  atRiyadh("2026-08-26T04:00:00+03:00", () => {
    assert.equal(isWithinOpeningHours(null), true);
    assert.equal(isWithinOpeningHours({}), true);
    assert.equal(isWithinOpeningHours({ open: "غير صالح", close: "23:00" }), true);
    assert.equal(isWithinOpeningHours({ days: { "5": { open: "14:00", close: "23:00" } } }), true);
  });
});
