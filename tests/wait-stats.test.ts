/**
 * إحصاء «من الانضمام حتى التجليس».
 *
 * الرقم يُعرض على ثلاث شاشات ويقرؤه المالك قرارًا تشغيليًّا، وكان تعريفه
 * مكرَّرًا في خمسة مواضع انحرف أحدها فعلًا (rollup_daily_stats بلا سقف،
 * أُصلح في ٠٢٠٠). فالتعريف الآن في موضعٍ واحد، وهنا حدودُه مكتوبةً بالأرقام.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { waitStats, waitMinutes, WAIT_MAX_MIN } from "../src/lib/wait-stats";

/** صفٌّ بفارقٍ محدَّدٍ بالدقائق. */
const row = (min: number, base = "2026-09-01T18:00:00.000Z") => ({
  joined_at: base,
  seated_at: new Date(new Date(base).getTime() + min * 60000).toISOString(),
});

test("السقف ٦٠٠ دقيقة — نفسه في الشاشات وتقرير تلغرام و٠٢٠٠", () => {
  assert.equal(WAIT_MAX_MIN, 600);
});

test("المتوسّط والوسيط على مجموعةٍ بسيطة", () => {
  const s = waitStats([row(10), row(20), row(30)]);
  assert.deepEqual(s, { avg: 20, median: 20, n: 3 });
});

test("الوسيط في العدد الزوجيّ = متوسّط الأوسطين", () => {
  const s = waitStats([row(10), row(20), row(30), row(100)]);
  assert.equal(s.median, 25); // (20+30)/2
  assert.equal(s.avg, 40);    // (10+20+30+100)/4
  assert.equal(s.n, 4);
});

test("الوسيط يكشف الالتواء الذي يخفيه المتوسّط", () => {
  // تسعةُ ضيوفٍ سريعين وواحدٌ نُسي مفتوحًا — نمط Pizza peel المقيس
  const s = waitStats([...Array(9).fill(0).map(() => row(5)), row(500)]);
  assert.equal(s.median, 5, "الوسيط يبقى على التجربة النمطيّة");
  assert.equal(s.avg, 55, "المتوسّط يقفز أحد عشر ضعفًا");
  assert.ok(s.avg > s.median * 2, "الفجوة هي الخبر");
});

test("الشواذّ تسقط: ما بلغ ٦٠٠ فأكثر، وما كان سالبًا", () => {
  assert.deepEqual(waitMinutes([row(599)]), [599], "٥٩٩ داخل الحدّ");
  assert.deepEqual(waitMinutes([row(600)]), [], "٦٠٠ خارجه (الحدّ حصريّ)");
  assert.deepEqual(waitMinutes([row(1380)]), [], "٢٣ ساعة تسقط — نفس صفّ اختبار ٠٢٠٠");
  assert.deepEqual(waitMinutes([row(-5)]), [], "السالب ساعةُ خادمٍ مضطربة لا انتظار");
});

test("الصفر مقبول — التجليس الفوريّ واقعٌ يوميّ", () => {
  const s = waitStats([row(0), row(0), row(10)]);
  assert.equal(s.n, 3);
  assert.equal(s.median, 0);
});

test("صفٌّ بلا seated_at لا يدخل الحساب", () => {
  const s = waitStats([{ joined_at: "2026-09-01T18:00:00.000Z", seated_at: null }, row(10)]);
  assert.equal(s.n, 1);
  assert.equal(s.avg, 10);
});

test("لا صفوف ⇒ أصفار لا NaN (الشاشة تعرض ٠ لا «غير معرّف»)", () => {
  const s = waitStats([]);
  assert.deepEqual(s, { avg: 0, median: 0, n: 0 });
  const allDropped = waitStats([row(700), row(-1)]);
  assert.deepEqual(allDropped, { avg: 0, median: 0, n: 0 });
});

test("لا يعبث بترتيب المصفوفة الواردة", () => {
  const rows = [row(30), row(10), row(20)];
  const copy = rows.map((r) => r.seated_at);
  waitStats(rows);
  assert.deepEqual(rows.map((r) => r.seated_at), copy, "الفرز على نسخة لا على الأصل");
});
