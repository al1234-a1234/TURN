/**
 * حارس: دليلٌ ناقصٌ يكذب.
 *
 * مضيفٌ يقرأ «أوقف الطابور» بلا أن يُقال له فرقُه عن «أغلق الفرع» قد يوقف
 * الطابور ظانًّا أنّه أغلق المطعم — والعملاء يتوافدون على فرعٍ ظاهرٍ يستقبل.
 * فهذه الاختبارات تحرس الشكل لا الذوق: كلّ بندٍ يقول **ماذا** و**متى**،
 * والثلاثة المتشابهة يقول كلٌّ منها **فرقَه**.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MANUAL, OWNER_MANUAL, type ManualEntry } from "../src/lib/guide-manual.ts";

const ALL = [...MANUAL, ...OWNER_MANUAL];
const ENTRIES: ManualEntry[] = ALL.flatMap((s) => [...s.entries]);
const ARABIC = /[؀-ۿ]/;

test("لا قسمَ فارغًا، ولا بندَ بلا عنوان", () => {
  assert.ok(ALL.length >= 4, "الأقسام أقلّ ممّا طُلب");
  for (const s of ALL) {
    assert.ok(s.entries.length > 0, `القسم ${s.id} فارغ`);
    assert.ok(s.title[0].trim() && s.title[1].trim(), `القسم ${s.id} بلا عنوان`);
  }
  assert.ok(ENTRIES.length >= 15, `البنود ${ENTRIES.length} — أقلّ من أن تُسمّى دليلًا`);
});

test("كلّ بندٍ يقول «ماذا» و«متى» — باللغتين، وبجملةٍ لا بكلمة", () => {
  for (const e of ENTRIES) {
    for (const [field, pair] of [["what", e.what], ["when", e.when]] as const) {
      assert.ok(pair[0].trim().length > 25, `${e.title[0]} — ${field} عربيّ أقصر من أن يفيد`);
      assert.ok(pair[1].trim().length > 25, `${e.title[0]} — ${field} إنجليزيّ أقصر من أن يفيد`);
    }
  }
});

test("الثلاثة التي تُخلط: كلٌّ منها يذكر فرقَه عن أخويه", () => {
  const three = MANUAL.find((s) => s.id === "three");
  assert.ok(three, "قسم «الثلاثة» مفقود");
  assert.equal(three!.entries.length, 3);
  for (const e of three!.entries) {
    assert.ok(e.vs, `${e.title[0]} بلا «الفرق عن المشابه» — وهو سبب وجود القسم`);
    assert.ok(e.vs![0].trim().length > 25 && e.vs![1].trim().length > 25);
  }
});

test("وهو القسم الأوّل — من يقرأ سطرًا واحدًا يقرأ هذا", () => {
  assert.equal(MANUAL[0].id, "three");
});

test("الإنجليزيّة إنجليزيّة، والعربيّة عربيّة", () => {
  for (const e of ENTRIES) {
    const pairs = [e.title, e.what, e.when, ...(e.vs ? [e.vs] : [])];
    for (const p of pairs) {
      assert.ok(ARABIC.test(p[0]), `«${e.title[0]}» فيه حقلٌ عربيّ بلا عربيّة`);
      assert.ok(!ARABIC.test(p[1]), `«${e.title[0]}» فيه حقلٌ إنجليزيّ يحوي عربيّة`);
    }
  }
});

test("لا عنوانَ مكرّرًا — العنوان هو ما يبحث عنه القارئ", () => {
  const seen = new Set<string>();
  for (const e of ENTRIES) {
    assert.ok(!seen.has(e.title[0]), `عنوانٌ مكرّر: ${e.title[0]}`);
    seen.add(e.title[0]);
  }
});

test("دليل المالك يغطّي البنود الستّة المطلوبة", () => {
  const text = OWNER_MANUAL.flatMap((s) => s.entries.map((e) => e.title[0])).join(" | ");
  for (const needed of ["أوقات العمل", "سقف حجم الطابور", "أقسام الجلوس", "المنيو", "استقبال قائمة الانتظار", "الموظفون"]) {
    assert.ok(text.includes(needed), `دليل المالك بلا «${needed}»`);
  }
});

test("دليل الاستقبال يغطّي أفعاله اليوميّة ورسائله", () => {
  const text = MANUAL.flatMap((s) => s.entries.map((e) => e.title[0])).join(" | ");
  for (const needed of ["أغلق الفرع", "افتح الطابور", "مزدحمًا", "أضف للطابور", "جلوس", "إزالة", "العدّاد والسقف"]) {
    assert.ok(text.includes(needed), `دليل الاستقبال بلا «${needed}»`);
  }
  const messages = MANUAL.find((s) => s.id === "messages");
  assert.ok(messages && messages.entries.length >= 3, "قسم الرسائل والأخطاء ناقص");
});
