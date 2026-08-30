/**
 * حارس: الدليل يشرح المسار الذي يراه العميل فعلًا — لا مسارًا آخر.
 *
 * دليلٌ يقول «سجّل اسمك ورقمك لتأخذ دورك» في مطعمٍ لا يقبل الدور أسوأ من لا
 * دليل: يُرسل العميلَ يبحث عن زرٍّ غير موجود، ثمّ يلوم التطبيق.
 *
 * والقيد الذي يحرسه: **لا حقل إعدادٍ جديد**. الوضع يُشتقّ من `accepts` و
 * `acceptsReservations` وحدهما — نفس الحقلين اللذين يقرّران أيّ زرٍّ يظهر.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { guideMode, guideSeenKey } from "../src/lib/guide-mode.ts";

const W = { accepts: true, acceptsReservations: false };
const R = { accepts: false, acceptsReservations: true };
const B = { accepts: true, acceptsReservations: true };
const N = { accepts: false, acceptsReservations: false };

test("انتظار فقط ⇒ خطوات الانتظار", () => {
  assert.equal(guideMode([W]), "waitlist");
});

test("حجز فقط ⇒ خطوات الحجز", () => {
  assert.equal(guideMode([R]), "reservations");
});

test("الاثنان ⇒ خطوات الزرّ الرئيسيّ، وهو الانتظار", () => {
  assert.equal(guideMode([B]), "waitlist");
});

test("لا هذا ولا ذاك ⇒ استقبالٌ مباشر، ولا نَعِد بما لا يوجد", () => {
  assert.equal(guideMode([N]), "walkin");
});

test("فروعٌ متعدّدة: يكفي فرعٌ واحدٌ يقبل الدور — الغطاء يخصّ المطعم لا فرعًا", () => {
  assert.equal(guideMode([N, R, W]), "waitlist");
  assert.equal(guideMode([N, R]), "reservations");
  assert.equal(guideMode([N, N]), "walkin");
});

test("بلا فروع أو بحقولٍ غائبة ⇒ لا يَعِد بشيء (لا انهيار)", () => {
  assert.equal(guideMode([]), "walkin");
  assert.equal(guideMode([{}]), "walkin");
  assert.equal(guideMode([{ accepts: undefined }]), "walkin");
});

test("«غير محدّد» ليس «متاحًا»: القيمة true وحدها تفتح المسار", () => {
  // حراسةٌ ضدّ انزلاقٍ إلى `!== false` — الذي يجعل صفَّ إعداداتٍ ناقصًا
  // يَعِد العميلَ بدورٍ لا يقبله الفرع.
  assert.equal(guideMode([{ accepts: null as unknown as undefined }]), "walkin");
});

test("مفتاح التخزين مربوطٌ بالمطعم: دليلُ مطعمٍ لا يُسكت دليلَ غيره", () => {
  assert.notEqual(guideSeenKey("eficto"), guideSeenKey("pizza-peel"));
  assert.match(guideSeenKey("eficto"), /eficto/);
});
