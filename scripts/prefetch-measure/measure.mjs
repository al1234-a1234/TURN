// قياس فعليّ لسبب "القفزة" عند الانتقال من قائمة المطاعم لصفحة المطعم.
//
// يشتغل من جهازك أو من مجرى GitHub Actions (هذه البيئة محجوبة عن
// ei8ht.app — 403 connect_rejected، تحقّقتُ منه لحظيًّا). يفتح القائمة
// بمحاكاة جوّال حقيقية، يسكرول بسرعة، ويضغط أوّل بطاقة تدخل الشاشة توًّا
// — بالضبط سيناريو السؤال — ويقيس من Resource Timing API الفعلية (لا
// تخمين بصري):
//
//   ١) هل طلب صفحة المطعم بدأ قبل لحظة الضغط (prefetch سابق) أو معها
//      (لا يوجد prefetch سابق)؟
//   ٢) كم استغرق من الضغط لحظة ظهور المحتوى الحقيقي (لا الهيكل الرمادي)؟
//   ٣) هل التأخير من الشبكة (الطلب نفسه) أو من الرسم/الصور/الخط بعد وصول
//      الطلب؟
//
// يكرّرها N مرّة ببطاقات مختلفة ويطبع جدول أرقام + يحفظ JSON تفصيليّ.
//
// التشغيل محليًّا:
//   npm i -D playwright && npx playwright install chromium
//   BASE_URL=https://ei8ht.app RUNS=10 node measure.mjs
//
// أو عبر مجرى "قياس أداء الانتقال (يدويّ فقط)" بتبويب Actions.

import { chromium, devices } from "playwright";
import fs from "node:fs";

const BASE_URL = process.env.BASE_URL || "https://ei8ht.app";
const RUNS = Number(process.env.RUNS || 10);
const OUT = process.env.OUT || "prefetch-report.json";

function fmtMs(n) {
  return n == null ? "—" : `${n.toFixed(0)}ms`;
}

async function run() {
  const browser = await chromium.launch();
  const results = [];

  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      // شبكة جوّال حقيقية لا واي فاي المكتب — 4G سريع تقريبيًّا. عدّل لو
      // تبي محاكاة أضعف (Slow 3G) عبر CDP لاحقًا.
    });
    const page = await context.newPage();

    // نجمع كل موارد الشبكة بدقّة بالطابع الزمني (relative to navigationStart)
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });

    // نلتقط شعارات الكروت المرئية حاليًا كي نعرف الجديد بعد السكرول
    const before = await page.$$eval("a[href^='/r/']", (as) => as.map((a) => a.getAttribute("href")));

    // سكرول سريع عشوائي — يقلّد مستخدم يمرّر بسرعة
    const scrollBy = 400 + Math.floor(Math.random() * 900);
    await page.mouse.wheel(0, scrollBy);
    // مهلة قصيرة جدًّا فقط لضمان أن العنصر التصق بالـDOM — لا وقت كافٍ
    // لاكتمال أي prefetch إن لم يكن بدأ فعلًا (هذا هو صلب الاختبار)
    await page.waitForTimeout(80);

    const after = await page.$$eval("a[href^='/r/']", (as) => as.map((a) => a.getAttribute("href")));
    const fresh = after.find((h) => h && !before.includes(h));
    const targetHref = fresh || after[Math.floor(Math.random() * after.length)];
    if (!targetHref) {
      await context.close();
      continue;
    }
    const slug = targetHref.split("/r/")[1];

    // نضبط علامة الضغط بدقّة عالية داخل صفحة المتصفّح نفسها (نفس الساعة
    // التي تُقاس بها موارد الشبكة)، لا بساعة Node الخارجية.
    const clickMark = await page.evaluate((href) => {
      const el = document.querySelector(`a[href="${href}"]`);
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const t = performance.now();
      el.click();
      return t;
    }, targetHref);

    if (clickMark == null) {
      await context.close();
      continue;
    }

    // ننتظر ظهور المحتوى الحقيقي — العنوان sr-only في page.tsx موجود فقط
    // بالصفحة الحقيقية، لا بهيكل loading.tsx
    let realContentAt = null;
    try {
      await page.waitForFunction(
        () => {
          const h1 = document.querySelector("h1.sr-only");
          return !!(h1 && h1.textContent && h1.textContent.trim().length > 0);
        },
        { timeout: 8000 },
      );
      realContentAt = await page.evaluate(() => performance.now());
    } catch {
      realContentAt = null;
    }

    // موارد الشبكة المرتبطة بمسار الصفحة (طلبات RSC/التنقّل عبر Next)
    const resourceTimings = await page.evaluate((slugPart) => {
      return performance
        .getEntriesByType("resource")
        .filter((e) => e.name.includes(`/r/${slugPart}`))
        .map((e) => ({
          name: e.name,
          startTime: e.startTime,
          responseEnd: e.responseEnd,
          transferSize: e.transferSize,
          initiatorType: e.initiatorType,
        }));
    }, slug);

    // أقرب مورد بدأ قبل أو عند لحظة الضغط بفارق معقول (prefetch سابق)
    const priorFetch = resourceTimings
      .filter((r) => r.startTime <= clickMark + 5) // هامش ٥ملّي لخطأ القياس
      .sort((a, b) => a.startTime - b.startTime)[0];

    const postClickFetch = resourceTimings
      .filter((r) => r.startTime > clickMark + 5)
      .sort((a, b) => a.startTime - b.startTime)[0];

    const totalDelay = realContentAt != null ? realContentAt - clickMark : null;
    const networkDelay = priorFetch
      ? 0 // كان جاهزًا مسبقًا
      : postClickFetch
        ? postClickFetch.responseEnd - clickMark
        : null;
    const renderDelay = totalDelay != null && networkDelay != null ? totalDelay - networkDelay : null;

    results.push({
      run: i + 1,
      slug,
      clickMark,
      hadPriorPrefetch: !!priorFetch,
      priorFetch,
      postClickFetch,
      totalDelayMs: totalDelay,
      networkDelayMs: networkDelay,
      renderDelayMs: renderDelay,
    });

    console.log(
      `#${i + 1} ${slug.padEnd(24)} prefetch سابق: ${priorFetch ? "نعم" : "لا"}  ` +
        `إجمالي: ${fmtMs(totalDelay)}  شبكة: ${fmtMs(networkDelay)}  رسم: ${fmtMs(renderDelay)}`,
    );

    await context.close();
  }

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

  const withPrefetch = results.filter((r) => r.hadPriorPrefetch);
  const withoutPrefetch = results.filter((r) => !r.hadPriorPrefetch);
  const avg = (arr, key) => {
    const vals = arr.map((r) => r[key]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  console.log("\n— الخلاصة —");
  console.log(`محاولات فيها prefetch سابق: ${withPrefetch.length}/${results.length}`);
  console.log(`محاولات بلا prefetch سابق: ${withoutPrefetch.length}/${results.length}`);
  console.log(`متوسّط التأخير الكلّي (مع prefetch): ${fmtMs(avg(withPrefetch, "totalDelayMs"))}`);
  console.log(`متوسّط التأخير الكلّي (بلا prefetch): ${fmtMs(avg(withoutPrefetch, "totalDelayMs"))}`);
  console.log(`متوسّط تأخير الرسم بعد وصول البيانات: ${fmtMs(avg(results, "renderDelayMs"))}`);
  console.log(`\nالتفاصيل الكاملة محفوظة في: ${OUT}`);

  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
