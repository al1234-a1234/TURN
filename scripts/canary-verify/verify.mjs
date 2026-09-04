// تحقّق بصري حيّ على ei8ht.app — قراءة فقط، بلا أي انضمام أو إرسال نموذج.
// يقرأ فقط بيانات طُعم مزروعة سلفًا في مستأجر "طُعم-اختبار-يدوي" (منفصل عن
// أي مسبار آليّ). يطبع نصّ الصفحة الفعليّ من متصفّح حقيقيّ + لقطات شاشة —
// إثباتٌ مقيسٌ لا افتراضٌ، بنفس أسلوب measure.mjs السابق في هذه الجلسة.

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

  // ٣) نافذة مراقبة طويلة (٣ دقائق، كل ١٠ث) — تكفي لالتقاط لحظة التبديل
  //    اليدويّ لموضع الطُّعم من الجلسة الأخرى (SQL مباشر يطابق أثر
  //    swap_queue_positions حرفيًّا)، ثمّ التقاط اختفاء البانر التلقائيّ
  //    بعد أوّل استطلاعٍ تالٍ لظهوره.
  log("== TEST 3: watching for delay banner (~3 min window) ==");
  const CHECKS = 18;
  const INTERVAL_MS = 10_000;
  let sawBanner = false;
  let sawBannerClearAfter = false;
  for (let i = 1; i <= CHECKS; i++) {
    await page.waitForTimeout(INTERVAL_MS);
    const state = await readTicketState(page);
    log(`CHECK ${i}/${CHECKS} t=+${i * 10}s hasDelayBanner=${state.hasDelayBanner}`);
    if (state.hasDelayBanner) {
      sawBanner = true;
      await page.screenshot({ path: `${OUT}/03-banner-check${i}.png`, fullPage: true });
      writeFileSync(`${OUT}/03-banner-check${i}.txt`, state.bodyText, "utf8");
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
