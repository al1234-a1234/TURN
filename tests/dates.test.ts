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
