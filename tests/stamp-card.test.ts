/**
 * اختبارات اشتقاق بطاقة الأختام من برنامج الولاء.
 * البطاقة تصحّ فقط حين يكون البرنامج زياراتيًّا نظيفًا — غير ذلك شريط.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stampSlots } from "../src/components/stamp-card.tsx";

test("برنامج «٤ والخامسة هدية»: 50 نقطة ÷ 10 لكل زيارة = 5 أختام", () => {
  assert.equal(stampSlots(50, 10), 5);
  assert.equal(stampSlots(5, 1), 5);
});

test("قسمة غير صحيحة = برنامج نقاطي حرّ — لا أختام", () => {
  assert.equal(stampSlots(100, 30), null);
  assert.equal(stampSlots(7, 2), null);
});

test("خانات كثيرة أو قليلة تكسر البطاقة بصريًّا — نرجع للشريط", () => {
  assert.equal(stampSlots(100, 5), null); // 20 ختمًا لا تُعرض
  assert.equal(stampSlots(10, 10), null); // ختم واحد بلا معنى
  assert.equal(stampSlots(120, 10), 12);  // الحدّ الأعلى المقبول
});

test("مدخلات فاسدة لا تكسر الشاشة", () => {
  assert.equal(stampSlots(0, 10), null);
  assert.equal(stampSlots(50, 0), null);
  assert.equal(stampSlots(-10, 5), null);
});
