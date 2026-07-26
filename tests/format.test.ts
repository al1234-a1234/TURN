/**
 * اختبارات وحدات للمنطق الحرج في تطبيع الأرقام.
 * التشغيل: npm test  (node --experimental-strip-types --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, saudiMobile } from "../src/lib/format.ts";

test("normalizePhone: أرقام عربية وفارسية تتحول للاتينية", () => {
  assert.equal(normalizePhone("٠٥٠٦٠٨٩١٦٤"), "0506089164");
  assert.equal(normalizePhone("۰۵۰۶۰۸۹۱۶۴"), "0506089164");
  assert.equal(normalizePhone("0506089164٦"), "05060891646");
});

test("normalizePhone: يسقط الفواصل والرموز", () => {
  assert.equal(normalizePhone("050 608-9164"), "0506089164");
  assert.equal(normalizePhone("+966 50 608 9164"), "966506089164");
  assert.equal(normalizePhone(""), "");
});

test("saudiMobile: كل الصيغ الصحيحة تتوحد إلى 05XXXXXXXX", () => {
  for (const input of ["0506089164", "506089164", "966506089164", "+966506089164", "00966506089164", "٠٥٠٦٠٨٩١٦٤"]) {
    assert.equal(saudiMobile(input), "0506089164", input);
  }
});

test("saudiMobile: المشوّه يُرفض (يرجع فارغًا)", () => {
  for (const bad of ["0506089164٦", "0506089164٣٤٦٤", "12345", "01234567890", "", "abc"]) {
    assert.equal(saudiMobile(bad), "", bad);
  }
});
