/**
 * حارس «لا ضغطةَ بلا جواب».
 *
 * العطب الذي وُلد منه: عميلٌ ضغط «خذ دورك الآن» في اللحظة التي أُغلق فيها
 * الفرعُ أو امتلأ الطابور، فلم يرَ خطأً ولا نجاحًا. سببان مستقلّان:
 *   ١) الإجراء كان يعالج خمسةً من سبعةِ رموزٍ ترفعها القاعدة، فيسقط الباقي
 *      في جملةٍ عامّة لا تقول شيئًا.
 *   ٢) خانةُ الخطأ كانت داخل `<form>` وحده، والاستطلاعُ الحيّ يُزيل النموذج
 *      قبل عودة الجواب.
 *
 * هذا الملفّ يحرس (١) — وهو الوحيد القابل للاختبار بلا متصفّح. و(٢) يُتحقَّق
 * منه بالعين حسب «كيف أتحقّق أنا بنفسي» في وصف الـPR.
 *
 * ── ولماذا قائمةُ الرموز مكتوبةٌ هنا بيدٍ ──
 * لا قاعدةَ في الاختبارات. فالقائمة مأخوذةٌ من الإنتاج باستعلامٍ مثبَّتٍ في
 * وصف الـPR، ومكتوبةٌ هنا كعقد. وحين تُضاف حالةُ رفضٍ جديدة في القاعدة بلا
 * رسالةٍ لها هنا، **يسقط هذا الاختبار** — وهو المقصود بالضبط.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DB_JOIN_CODES,
  EXTRA_JOIN_CODES,
  joinErrorMessage,
  genericJoinError,
  GENERIC_JOIN_ERROR,
} from "../src/lib/join-errors.ts";

const LANGS = ["ar", "en"] as const;
const ALL = [...DB_JOIN_CODES, ...EXTRA_JOIN_CODES];

test("كلّ رمزٍ ترفعه القاعدة له رسالةٌ صريحة — باللغتين", () => {
  for (const code of ALL) {
    for (const lang of LANGS) {
      const m = joinErrorMessage(code, lang);
      assert.ok(m, `الرمز ${code} بلا رسالة (${lang})`);
      assert.ok(m!.trim().length > 8, `رسالة ${code} أقصر من أن تفيد (${lang})`);
    }
  }
});

test("ولا واحدٌ منها يقع في الرسالة العامّة — العموميّة للمجهول وحده", () => {
  for (const code of ALL) {
    for (const lang of LANGS) {
      assert.notEqual(
        joinErrorMessage(code, lang),
        genericJoinError(lang),
        `الرمز ${code} يُعرض بالرسالة العامّة (${lang}) — العميل لا يعرف ما جرى`,
      );
    }
  }
});

test("P0011 (الطابور موقوف) مغطّى — وهو افتراض كلّ فرعٍ جديد منذ 0150", () => {
  assert.match(joinErrorMessage("P0011", "ar")!, /تفضّل مباشرةً/);
  assert.match(joinErrorMessage("P0011", "en")!, /walk straight in/i);
});

test("«أُغلق» و«امتلأ» تقولان صراحةً إنّ الدور لم يُسجَّل", () => {
  assert.match(joinErrorMessage("P0003", "ar")!, /لم يُسجَّل دورك/);
  assert.match(joinErrorMessage("P0010", "ar")!, /لم يُسجَّل دورك/);
});

test("الرسائل متمايزة: لا رسالتين متطابقتين لسببين مختلفين", () => {
  const seen = new Map<string, string>();
  for (const code of ALL) {
    const m = joinErrorMessage(code, "ar")!;
    // P0429 وP0432 لهما نصّان مختلفان؛ أيّ تطابقٍ هنا يعني رمزًا يضيع في آخر
    assert.ok(!seen.has(m), `${code} يشترك في نصّ ${seen.get(m)}`);
    seen.set(m, code);
  }
});

test("المجهول يسقط في العامّة لا في الصمت", () => {
  assert.equal(joinErrorMessage("P9999", "ar"), null);
  assert.equal(joinErrorMessage(undefined, "ar"), null);
  assert.equal(joinErrorMessage(null, "ar"), null);
  // والمستدعي يستبدلها بالعامّة — التي لا تكون فارغةً أبدًا
  for (const lang of LANGS) assert.ok(genericJoinError(lang).length > 10);
});

test("اللغة الإنجليزيّة لا ترجع نصًّا عربيًّا", () => {
  const arabic = /[؀-ۿ]/;
  for (const code of ALL) {
    assert.ok(!arabic.test(joinErrorMessage(code, "en")!), `${code} يرجع عربيًّا في en`);
  }
  assert.ok(!arabic.test(GENERIC_JOIN_ERROR[1]));
});
