/**
 * اختبارات فكّ حمولة باركود الهدية — منطق الماسح عند الكاشير.
 * التشغيل: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRewardCode, rewardPayload } from "../src/lib/reward-code.ts";

test("الحمولة الرسمية TURN:R: تُفكّ وترجع الرمز بأحرف كبيرة", () => {
  assert.equal(extractRewardCode("TURN:R:A7K2M9"), "A7K2M9");
  assert.equal(extractRewardCode("turn:r:a7k2m9"), "A7K2M9");
  assert.equal(extractRewardCode("  TURN:R:XYZ234  "), "XYZ234");
});

test("الرمز السداسي المجرّد يُقبل (المسار اليدوي نفسه)", () => {
  assert.equal(extractRewardCode("A7K2M9"), "A7K2M9");
  assert.equal(extractRewardCode("a7k2m9"), "A7K2M9");
});

test("أبجدية القاعدة: بلا 0/O/1/I — رمز يحملها مجرّدًا يُرفض", () => {
  // gen_reward_code لا يولّدها؛ قبولها يعني قبول قراءة خاطئة للكاميرا
  assert.equal(extractRewardCode("A0K2M9"), null);
  assert.equal(extractRewardCode("AOK2M9"), null);
  assert.equal(extractRewardCode("A1K2M9"), null);
  assert.equal(extractRewardCode("AIK2M9"), null);
});

test("باركودات غريبة تُرفض بصمت: روابط ومنتجات وطوابير", () => {
  assert.equal(extractRewardCode("https://turn-alpha.vercel.app/r/eficto"), null);
  assert.equal(extractRewardCode("6291041500213"), null); // EAN-13
  assert.equal(extractRewardCode(""), null);
  assert.equal(extractRewardCode("TURN:R:"), null);
  assert.equal(extractRewardCode("TURN:R:toolongcodeover12chars"), null);
});

test("rewardPayload ↔ extractRewardCode: ذهاب وإياب بلا فقد", () => {
  for (const code of ["A7K2M9", "ZZZZZZ", "234567"]) {
    assert.equal(extractRewardCode(rewardPayload(code)), code);
  }
});
