// تحقّق بصري حيّ على ei8ht.app — قراءة فقط، بلا أي انضمام أو إرسال نموذج.
// يقرأ فقط بيانات طُعم مزروعة سلفًا في مستأجر "طُعم-اختبار-يدوي" (منفصل عن
// أي مسبار آليّ). يطبع نصّ الصفحة الفعليّ من متصفّح حقيقيّ + لقطات شاشة —
// إثباتٌ مقيسٌ لا افتراضٌ، بنفس أسلوب measure.mjs السابق في هذه الجلسة.
//
// الجولة الأولى (run 33834169025) أثبتت نصّ الإلغاء لكن فوّتت لحظة ظهور
// البانر: فحصي كان كل ١٠ث بنفس وتيرة استطلاع العميل (١٠ث أيضًا)، فتقفّلا
// معًا على نفس التوقيت تقريبًا — فحصي كان يقع غالبًا لحظة ظهور البانر أو
// اختفائه بالضبط، لا في منتصف نافذته المرئية. هذه النسخة تفحص كل ٢ث بدل
// ١٠ث — أقصر بكثير من دورة استطلاع العميل — لضمان التقاط النافذة المرئية
// (~١٠ث) بصرف النظر عن أي تزامن صدفة.

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://ei8ht.app";
const CANCEL_ENTRY_ID = "f2d4417d-8226-4039-9529-7b150568d61c";
const TARGET_ENTRY_ID = "4aca1f93-c507-4a44-8884-956bb4d83b59";
const OUT = "artifacts";
mkdirSync(OUT, { recursive: true });

const NEW_CANCEL_TEXT_AR = "انتهى دورك — نتشرف بزيارتك مرة ثانية";
const OLD_CANCEL_TEXT_AR = "تم إلغاء دورك";
const DELAY_BANNER_AR = "دورك تغيّر بسبب تأخّرك عن الحضور";

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function readTicketState(page) {
  const body = await page.locator("body").innerText();
  return {
    hasNewCancelText: body.includes(NEW_CANCEL_TEXT_AR),
    hasOldCancelText: body.includes(OLD_CANCEL_TEXT_AR),
    hasDelayBanner: body.includes(DELAY_BANNER_AR),
    bodyText: body,
  };
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  // ١) صفحة التذكرة الملغاة — نصّ الإلغاء الجديد
  log("== TEST 1: cancel text ==");
  await page.goto(`${BASE}/t/${CANCEL_ENTRY_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const cancelState = await readTicketState(page);
  log("CANCEL_HAS_NEW_TEXT:", cancelState.hasNewCancelText);
  log("CANCEL_HAS_OLD_TEXT:", cancelState.hasOldCancelText);
  await page.screenshot({ path: `${OUT}/01-cancel.png`, fullPage: true });
  writeFileSync(`${OUT}/01-cancel.txt`, cancelState.bodyText, "utf8");

  // ٢) صفحة التذكرة الحيّة — الأساس (بلا بانر بعد)
  log("== TEST 2: delay banner — baseline ==");
  await page.goto(`${BASE}/t/${TARGET_ENTRY_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const baseline = await readTicketState(page);
  log("BASELINE_HAS_BANNER (يجب false):", baseline.hasDelayBanner);
  await page.screenshot({ path: `${OUT}/02-baseline.png`, fullPage: true });
  writeFileSync(`${OUT}/02-baseline.txt`, baseline.bodyText, "utf8");

  // ٣) نافذة مراقبة كثيفة (٤ دقائق، كل ٢ث = ١٢٠ فحصًا) — أقصر بكثير من
  //    دورة استطلاع العميل (١٠ث) كي لا تتقفّل الفحوص على توقيت الاستطلاع
  //    نفسه كما حدث بالجولة الأولى. تطبع فقط عند تغيّر الحالة + نبضة كل
  //    ١٠ فحوص كإثبات حياة.
  log("== TEST 3: watching for delay banner (~4 min window, every 2s) ==");
  const CHECKS = 120;
  const INTERVAL_MS = 2_000;
  let lastBanner = false;
  let sawBanner = false;
  let sawBannerClearAfter = false;
  let shotCount = 0;
  for (let i = 1; i <= CHECKS; i++) {
    await page.waitForTimeout(INTERVAL_MS);
    const state = await readTicketState(page);
    if (state.hasDelayBanner !== lastBanner) {
      log(`CHANGE ${i}/${CHECKS} t=+${i * 2}s hasDelayBanner: ${lastBanner} -> ${state.hasDelayBanner}`);
      lastBanner = state.hasDelayBanner;
    } else if (i % 10 === 0) {
      log(`HEARTBEAT ${i}/${CHECKS} t=+${i * 2}s hasDelayBanner=${state.hasDelayBanner}`);
    }
    if (state.hasDelayBanner) {
      sawBanner = true;
      if (shotCount < 3) {
        shotCount++;
        await page.screenshot({ path: `${OUT}/03-banner-check${i}.png`, fullPage: true });
        writeFileSync(`${OUT}/03-banner-check${i}.txt`, state.bodyText, "utf8");
      }
    } else if (sawBanner) {
      sawBannerClearAfter = true;
    }
  }

  log("SUMMARY_CANCEL_NEW_TEXT_OK:", cancelState.hasNewCancelText && !cancelState.hasOldCancelText);
  log("SUMMARY_BASELINE_NO_BANNER_OK:", !baseline.hasDelayBanner);
  log("SUMMARY_SAW_DELAY_BANNER:", sawBanner);
  log("SUMMARY_BANNER_AUTO_CLEARED:", sawBannerClearAfter);

  await browser.close();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
