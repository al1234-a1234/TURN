/**
 * خمس جلسات متصفّحٍ حقيقيّة — تعمل **مع** k6 لا قبله ولا بعده.
 *
 * لماذا هذا الملفّ موجود؟ لأنّ 03_load.js يقود الكتابات عبر دوالّ RPC، فهو
 * يُحمّل القاعدة والبركة تحميلًا كاملًا ويترك طبقة Next.js شبه غير مقيسة.
 * وكتابات العميل الحقيقيّة تمرّ بـ**Server Actions** — وهي التي تستهلك دالّة
 * Vercel وتقاس بها مدّة التنفيذ وسقف التزامن. هذه الجلسات وحدها تمرّ بها.
 *
 * فالرقم الذي يخرج من هنا هو **زمن المستخدم**: من الضغطة إلى ظهور النتيجة،
 * بما فيه الشبكة والتصيير وServer Action ورحلة بريدة↔فرانكفورت. وأرقام k6
 * أرقام خادمٍ لا أرقام إنسان — والفرق بينهما هو ما نبحث عنه.
 *
 * التشغيل (في طرفيّةٍ ثانية، بعد أن يبدأ k6 بدقيقة):
 *   npx playwright install chromium      # مرّة واحدة
 *   node 06_browser.mjs | tee browser.txt
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const TARGET = process.env.TARGET_URL;
if (!TARGET) { console.error("ينقص TARGET_URL"); process.exit(1); }
if (/ei8ht\.app/.test(TARGET)) {
  console.error("توقّف: TARGET_URL يشير إلى الإنتاج. هذه العدّة لبيئة المحاكاة وحدها.");
  process.exit(1);
}

const sessions = JSON.parse(readFileSync("./sessions.json", "utf8"));
const PASSWORD = sessions.password;

// ── مراحل k6: ٣٠ث صعود + ٦٠٠ث ثبات + ١٢٠ث تهدئة = ٧٥٠ث لكل درجة ──
const STAGE_SECONDS = 750;
const STAGE_NAMES = ["١٠ مطاعم", "٢٥ مطعمًا", "٥٠ مطعمًا", "١٠٠ مطعم"];
const TOTAL_MS = STAGE_SECONDS * STAGE_NAMES.length * 1000;
const T0 = Date.now();

const stageNow = () => {
  const i = Math.floor((Date.now() - T0) / 1000 / STAGE_SECONDS);
  return STAGE_NAMES[Math.min(i, STAGE_NAMES.length - 1)];
};

/** كل قياسٍ: الدرجة · الخطوة · المللي ثانية · نجح أم لا */
const samples = [];
const record = (step, ms, ok = true) =>
  samples.push({ stage: stageNow(), step, ms: Math.round(ms), ok });

/** يقيس خطوةً من منظور المستخدم: من الفعل إلى ظهور الدليل على الشاشة. */
async function timed(step, fn) {
  const t = Date.now();
  try {
    await fn();
    record(step, Date.now() - t, true);
    return true;
  } catch (e) {
    record(step, Date.now() - t, false);
    process.stdout.write(`\n  ✗ ${step}: ${String(e.message).slice(0, 70)}`);
    return false;
  }
}

const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];
const phoneFor = () => "0599" + String(rand(1e6)).padStart(6, "0");

// ════════════════════════════════════════════════════════════════════════════
//  العميل: الصفحة العامّة ← الانضمام ← استطلاع التذكرة ← الإلغاء
// ════════════════════════════════════════════════════════════════════════════
async function guestSession(browser, idx) {
  const ctx = await browser.newContext({
    locale: "ar-SA",
    // الانضمام يطلب الموقع، وزرّ الإرسال يبقى معطّلًا بدونه — فنمنحه إذنًا
    // ثابتًا (بريدة) كي نقيس المسار الحقيقيّ لا مسار الرفض
    geolocation: { latitude: 26.326, longitude: 43.975 },
    permissions: ["geolocation"],
    viewport: { width: 390, height: 844 },       // جوّالٌ لا سطح مكتب
  });
  const page = await ctx.newPage();

  while (Date.now() - T0 < TOTAL_MS) {
    const owner = pick(sessions.owners);
    const phone = phoneFor();

    const opened = await timed("عميل: فتح صفحة المطعم", async () => {
      await page.goto(`${TARGET}/r/${owner.slug}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.locator("#full_name").waitFor({ state: "visible", timeout: 30_000 });
    });
    if (!opened) { await page.waitForTimeout(5000); continue; }

    const joined = await timed("عميل: الانضمام (Server Action)", async () => {
      await page.locator("#full_name").fill(`ضيف متصفّح ${idx}`);
      await page.locator("#phone").fill(phone);
      const submit = page.getByRole("button", { name: /خذ دورك الآن/ });
      // مطعمٌ بفرعين يعرض مُنتقيًا؛ الزرّ يبقى معطّلًا حتى يُختار فرع
      if (await submit.isDisabled().catch(() => true)) {
        const card = page.locator("[data-branch-card], button:has-text('اختر')").first();
        if (await card.count()) await card.click({ timeout: 5000 }).catch(() => {});
      }
      await submit.click({ timeout: 20_000 });
      // الدليل على النجاح: انتقالٌ إلى صفحة التذكرة
      await page.waitForURL(/\/t\//, { timeout: 45_000 });
    });
    if (!joined) { await page.waitForTimeout(5000); continue; }

    // يستطلع تذكرته كما يفعل أيّ منتظر
    for (let i = 0; i < 3; i++) {
      await timed("عميل: تحديث التذكرة", async () => {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.getByText(/أمامك|ترتيبك|دورك/).first().waitFor({ timeout: 20_000 });
      });
      await page.waitForTimeout(10_000);
    }

    await timed("عميل: الإلغاء (Server Action)", async () => {
      await page.getByRole("button", { name: /ألغِ دوري/ }).click({ timeout: 15_000 });
      await page.getByRole("button", { name: /^نعم|تأكيد|إلغاء الدور/ }).first().click({ timeout: 10_000 });
      await page.getByText(/أُلغي|ملغى|cancelled/i).first().waitFor({ timeout: 25_000 });
    });

    await page.waitForTimeout(3000);
  }
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
//  الاستقبال: دخول ← لوحة ← إجلاس (بنقرةٍ مزدوجةٍ متعمَّدة) ← إزالة
// ════════════════════════════════════════════════════════════════════════════
async function receptionSession(browser, idx) {
  const me = sessions.reception[idx % sessions.reception.length];
  const ctx = await browser.newContext({ locale: "ar-SA", viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const loggedIn = await timed("استقبال: تسجيل الدخول", async () => {
    await page.goto(`${TARGET}/reception`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator("#username").fill(me.email);     // فيه @ فيُستعمل كما هو
    await page.locator("#code").fill(PASSWORD);
    await page.getByRole("button", { name: /دخول|تسجيل/ }).click();
    await page.waitForURL(/reception|dashboard/, { timeout: 45_000 });
  });
  if (!loggedIn) { await ctx.close(); return; }

  while (Date.now() - T0 < TOTAL_MS) {
    await timed("استقبال: فتح اللوحة", async () => {
      await page.goto(`${TARGET}/dashboard/reception`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.getByText(/الطابور الحيّ|لا أحد بالانتظار/).first().waitFor({ timeout: 30_000 });
    });

    const seat = page.getByRole("button", { name: /^جلوس$/ }).first();
    if (await seat.count()) {
      // ── النقر المزدوج المتعمَّد ──
      // الزرّ يحمل disabled={pending}، فالضغطة الثانية يجب أن تسقط على زرٍّ
      // معطّل. إن مرّت وأُجلِس الشخص مرّتين، فالحارس في الواجهة وحدها ولا
      // يحميه شيءٌ في القاعدة — وهذا ما يكشفه 04_verify.sql بعد الدرجة.
      await timed("استقبال: إجلاس (نقرة مزدوجة متعمَّدة)", async () => {
        await seat.click({ timeout: 15_000 });
        await seat.click({ timeout: 1500, force: true }).catch(() => {});  // الثانية قد تُرفض — وهذا المطلوب
        await page.waitForTimeout(1200);
      });
    }

    const remove = page.getByRole("button", { name: /^إزالة$/ }).first();
    if (await remove.count()) {
      await timed("استقبال: إزالة (Server Action)", async () => {
        await remove.click({ timeout: 15_000 });
        await page.waitForTimeout(1200);
      });
    }

    await page.waitForTimeout(10_000);   // نفس فترة الاستطلاع الحقيقيّة
  }
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
const q = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

function report() {
  const steps = [...new Set(samples.map((s) => s.step))];
  let out = "\n════════════════════════════════════════════════════════════════\n";
  out += "  زمن المستخدم الحقيقيّ — من الضغطة إلى ظهور النتيجة\n";
  out += "════════════════════════════════════════════════════════════════\n";
  for (const stage of STAGE_NAMES) {
    const inStage = samples.filter((s) => s.stage === stage);
    if (!inStage.length) continue;
    out += `\n── ${stage} ──\n`;
    out += "الخطوة".padEnd(42) + "عدد   p50     p95     فشل\n";
    for (const step of steps) {
      const rows = inStage.filter((s) => s.step === step);
      if (!rows.length) continue;
      const ok = rows.filter((r) => r.ok).map((r) => r.ms);
      const failed = rows.length - ok.length;
      out += step.padEnd(42) +
             String(rows.length).padEnd(6) +
             `${q(ok, 0.5)}ms`.padEnd(8) +
             `${q(ok, 0.95)}ms`.padEnd(8) +
             (failed ? `✗ ${failed}` : "—") + "\n";
    }
  }
  out += `
────────────────────────────────────────────────────────────────
  كيف تقرأه مع أرقام k6:

  • k6 يقيس زمن الخادم. هذا يقيس زمن الإنسان. الفرق الطبيعيّ هو
    التصيير والشبكة — ويجب أن يبقى **ثابتًا** بين الدرجات.
  • إن ثبت p95 عند k6 وارتفع هنا مع التصعيد، فالاختناق في طبقة
    Next.js لا في القاعدة — أي **سقف تزامن دوالّ Vercel**، وهو
    البند الذي لم يكن يُقاس.
  • «الانضمام» و«الإلغاء» و«الإجلاس» تمرّ بـServer Actions: هذه
    الثلاثة وحدها تستهلك دالّة Vercel. راقب p95 لها خاصّةً.
  • أيّ فشلٍ هنا مع نجاحٍ في k6 = عطبٌ في الواجهة لا في القاعدة.
────────────────────────────────────────────────────────────────
`;
  return out;
}

const main = async () => {
  console.log(`يبدأ الآن — ${STAGE_NAMES.length} درجات × ${STAGE_SECONDS / 60} دقيقة = ${TOTAL_MS / 60000} دقيقة.`);
  console.log("⚠ شغّله بعد أن يبدأ k6 بدقيقة، لا قبله ولا بعده.\n");

  const browser = await chromium.launch({ headless: true });
  await Promise.all([
    guestSession(browser, 1), guestSession(browser, 2), guestSession(browser, 3),
    receptionSession(browser, 0), receptionSession(browser, 1),
  ]);
  await browser.close();

  const text = report();
  console.log(text);
  writeFileSync("browser-results.json", JSON.stringify(samples, null, 2));
  writeFileSync("browser-results.txt", text);
  console.log("حُفظ: browser-results.json + browser-results.txt");
};

main().catch((e) => { console.error("✗", e); process.exit(1); });
