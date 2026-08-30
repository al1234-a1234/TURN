/**
 * حارس قرار حذف اشتراك الدفع.
 *
 * هذه الدالّة تحذف صفًّا من `push_subscriptions` في الإنتاج. فخطأٌ في اتّجاهها
 * له وجهان، وكلاهما صامت:
 *   ضيّقة أكثر من اللازم ⇒ اشتراكٌ ميّتٌ يبقى للأبد، والعميل يرى «مفعّل»
 *                          ولا يصله شيء (وهو ما وقع فعلًا: ١٢ رفضًا متتاليًا).
 *   واسعة أكثر من اللازم ⇒ خطأٌ عابرٌ عندنا يمسح اشتراكات المنصّة كلّها.
 *
 * فالحالتان مُثبَّتتان هنا بنصوصٍ **مأخوذةٍ حرفيًّا من جدول `notifications`
 * في الإنتاج** لا من التخمين.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeadSubscription } from "../src/lib/push-dead.ts";

/** نصّان حقيقيّان، منسوخان من عمود `error` في الإنتاج (٢٧–٢٩ أغسطس ٢٠٢٦). */
const APPLE_KEY_MISMATCH = '{"reason":"VapidPkHashMismatch"}';
const GONE = "push subscription has unsubscribed or expired.\n";

test("410 الميتة المعلنة ⇒ يُحذف", () => {
  assert.equal(isDeadSubscription(410, GONE), true);
});

test("404 غير موجود ⇒ يُحذف", () => {
  assert.equal(isDeadSubscription(404, ""), true);
});

test("400 VapidPkHashMismatch من آبل ⇒ يُحذف — وهذا هو العطب الذي أفلت", () => {
  assert.equal(isDeadSubscription(400, APPLE_KEY_MISMATCH), true);
});

test("النصّ هو المِعيار لا الرمز: المفتاح المختلف يُحذف بأيّ رمزٍ جاء", () => {
  assert.equal(isDeadSubscription(403, APPLE_KEY_MISMATCH), true);
  assert.equal(isDeadSubscription(undefined, APPLE_KEY_MISMATCH), true);
});

test("400 لسببٍ آخر ⇒ **لا** يُحذف — وإلا مسح خطأٌ واحدٌ عندنا كلّ الاشتراكات", () => {
  assert.equal(isDeadSubscription(400, '{"reason":"BadJsonBody"}'), false);
  assert.equal(isDeadSubscription(400, "payload too large"), false);
  assert.equal(isDeadSubscription(400, ""), false);
});

test("العابر يبقى: حدّ المعدّل وخطأ الخادم لا يقتلان اشتراكًا", () => {
  assert.equal(isDeadSubscription(429, "too many requests"), false);
  assert.equal(isDeadSubscription(500, "internal error"), false);
  assert.equal(isDeadSubscription(503, ""), false);
});

test("غياب الرمز والنصّ معًا ⇒ لا حذف (الشكّ لا يُتلف بيانات)", () => {
  assert.equal(isDeadSubscription(undefined, ""), false);
});
