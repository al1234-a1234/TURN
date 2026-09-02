/**
 * التقاط لقطات المقاطع الثلاثة — ٢٩ لقطة من التطبيق الشغّال.
 *
 *   node scripts/demo-video/capture.mjs
 *
 * لا يرسم شيئًا ولا يعيد بناء أيّ واجهة: كلّ ملفٍّ يخرج من هنا هو
 * `page.screenshot()` على التطبيق نفسه.
 *
 * ── سيناريو المتصفّحين المتوازيين ──
 * لقطات العميل ٠٦ و٠٧ و٠٨ ليست ساكنة: «تقدّم الدور» و«حان دورك» حالتان
 * يصنعهما الاستقبال. فالسكربت يفتح سياقين متزامنين — جوّال العميل ولوحة
 * الاستقبال — ويُجلِس من أمام العميل بينهما، ثمّ يلتقط تذكرته وقد تحرّكت
 * فعلًا. لا محاكاة: الرقم ينقص لأنّ صفًّا أمامه جُلِّس حقًّا.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE  = process.env.BASE_URL   ?? "http://localhost:3000";
const SLUG  = process.env.DEMO_SLUG  ?? "alasalah";
const USER  = process.env.STAFF_USER ?? "";
const PASS  = process.env.STAFF_PASS ?? "";
const OUT   = process.env.SHOTS_DIR  ?? path.resolve("screenshots");

if (!USER || !PASS) {
  console.error("✗ اضبط STAFF_USER وSTAFF_PASS — لوحتا الاستقبال والمالك خلف تسجيل دخول.");
  process.exit(1);
}

const SEL = JSON.parse(fs.readFileSync(new URL("./selectors.json", import.meta.url), "utf8"));
for (const d of ["customer", "reception", "owner"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });

const MOBILE  = { width: 390,  height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/** المحدِّد من selectors.json: إمّا دور+اسم وإمّا CSS. */
const pick = (page, s) =>
  s.role ? page.getByRole(s.role, { name: s.name, exact: false }).first() : page.locator(s.css).first();

/** إخفاء كلّ ما ليس من المنتج: شارة Next.js وأيّ أداة تطوير. */
const HIDE_DEV = `
  nextjs-portal, #__next-build-watcher, [data-nextjs-toast],
  [data-nextjs-dialog-overlay], .__next-dev-overlay { display: none !important; }
  * { caret-color: transparent !important; }
`;

async function ready(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(400);
}

let taken = [];
async function shot(page, dir, file) {
  await ready(page);
  const p = path.join(OUT, dir, file);
  await page.screenshot({ path: p });
  taken.push(`${dir}/${file}`);
  console.log(`  ✓ ${dir}/${file}`);
}

/** لقطةٌ متعذّرة تُسجَّل بالاسم والسبب ولا تُختلق. */
let missing = [];
async function tryShot(page, dir, file, action) {
  try {
    if (action) await action();
    await shot(page, dir, file);
  } catch (e) {
    missing.push({ shot: `${dir}/${file}`, reason: String(e.message ?? e).slice(0, 160) });
    console.log(`  ✗ ${dir}/${file} — ${String(e.message ?? e).slice(0, 100)}`);
  }
}

const browser = await chromium.launch();

// ══ سياق الاستقبال/المالك ══
const staffCtx = await browser.newContext({
  viewport: DESKTOP, deviceScaleFactor: 3, locale: "ar-SA", timezoneId: "Asia/Riyadh",
});
await staffCtx.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{
  const s=document.createElement('style');s.textContent=\`${HIDE_DEV}\`;document.head.appendChild(s);});`);
const staff = await staffCtx.newPage();

console.log("\n▸ تسجيل دخول الموظّف…");
await staff.goto(`${BASE}/partners`, { waitUntil: "networkidle" });
await pick(staff, SEL.partners.identifier).fill(USER);
await pick(staff, SEL.partners.password).fill(PASS);
await pick(staff, SEL.partners.submit).click();
await staff.waitForURL(/dashboard|reception/, { timeout: 30000 });
console.log("  ✓ دخل");

// ══ سياق العميل ══
const custCtx = await browser.newContext({
  viewport: MOBILE, deviceScaleFactor: 3, locale: "ar-SA", timezoneId: "Asia/Riyadh",
  isMobile: true, hasTouch: true,
});
await custCtx.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{
  const s=document.createElement('style');s.textContent=\`${HIDE_DEV}\`;document.head.appendChild(s);});`);
const cust = await custCtx.newPage();

// ══════════ المقطع ١ — العميل ══════════
console.log("\n▸ المقطع ١: العميل");
await cust.goto(`${BASE}/r/${SLUG}`, { waitUntil: "networkidle" });
await shot(cust, "customer", "01-restaurant.png");

await cust.evaluate(() => window.scrollBy({ top: 700, behavior: "instant" }));
await shot(cust, "customer", "02-menu.png");
await cust.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));

await tryShot(cust, "customer", "03-join-empty.png", async () => {
  await pick(cust, SEL.customer.joinOpen).click();
  await cust.waitForTimeout(600);
});
await tryShot(cust, "customer", "04-join-filled.png", async () => {
  await pick(cust, SEL.customer.fullName).fill("محمد أحمد");
  await pick(cust, SEL.customer.phone).fill("0551002030");
});
await tryShot(cust, "customer", "05-ticket.png", async () => {
  await pick(cust, SEL.customer.submit).click();
  await cust.waitForURL(/\/t\//, { timeout: 30000 });
});
const ticketUrl = cust.url();
console.log(`  التذكرة: ${ticketUrl}`);

// ── التوازي: الاستقبال يُجلِس من أمامه، ثمّ نلتقط تذكرته وقد تحرّكت ──
await staff.goto(`${BASE}/dashboard/reception`, { waitUntil: "networkidle" });
await ready(staff);

async function seatFirst() {
  const btn = pick(staff, SEL.reception.seat);
  await btn.click();
  await staff.waitForTimeout(1200);
  await staff.reload({ waitUntil: "networkidle" });
  await ready(staff);
}

await tryShot(cust, "customer", "06-ticket-advanced.png", async () => {
  await seatFirst();
  await cust.reload({ waitUntil: "networkidle" });
});
await tryShot(cust, "customer", "07-ticket-near.png", async () => {
  await seatFirst();
  await cust.reload({ waitUntil: "networkidle" });
});
await tryShot(cust, "customer", "08-your-turn.png", async () => {
  // «حان دورك» = حالة notified، يصنعها الاستقبال بزرّ التذكير
  const notify = staff.getByTitle(/تذكير واتساب|اتصال مباشر/).first();
  await notify.click({ timeout: 8000 });
  await staff.waitForTimeout(1200);
  await cust.reload({ waitUntil: "networkidle" });
});

// ══════════ المقطع ٢ — الاستقبال ══════════
console.log("\n▸ المقطع ٢: الاستقبال");
await staff.goto(`${BASE}/dashboard/reception`, { waitUntil: "networkidle" });
await shot(staff, "reception", "01-queue.png");

await tryShot(staff, "reception", "02-add-form.png", async () => {
  await pick(staff, SEL.reception.addToggle).click();
  await staff.waitForTimeout(500);
  await pick(staff, SEL.reception.fullName).fill("سارة ناصر");
  await pick(staff, SEL.reception.phone).fill("0554887711");
  await pick(staff, SEL.reception.partySize).fill("3");
});
await tryShot(staff, "reception", "03-after-add.png", async () => {
  await pick(staff, SEL.reception.submit).click();
  await staff.waitForTimeout(1500);
  await staff.reload({ waitUntil: "networkidle" });
});

await shot(staff, "reception", "04-before-seat.png");
await tryShot(staff, "reception", "05-after-seat.png", seatFirst);

await shot(staff, "reception", "06-before-cancel.png");
await tryShot(staff, "reception", "07-after-cancel.png", async () => {
  await pick(staff, SEL.reception.remove).click();
  await staff.waitForTimeout(1200);
  await staff.reload({ waitUntil: "networkidle" });
});

await shot(staff, "reception", "08-before-swap.png");
await tryShot(staff, "reception", "09-after-swap.png", async () => {
  const rows = staff.locator(SEL.reception.queueRow.css);
  await rows.nth(0).getByRole("button", { name: /اختر للتبديل/ }).click();
  await staff.waitForTimeout(400);
  await rows.nth(2).getByRole("button", { name: /بدّل مع المختار/ }).click();
  await staff.waitForTimeout(1500);
  await staff.reload({ waitUntil: "networkidle" });
});

await tryShot(staff, "reception", "10-reservations.png", async () => {
  await staff.goto(`${BASE}/dashboard/reservations`, { waitUntil: "networkidle" });
});

// شاشة التلفاز — تحتاج معرّف الفرع
const branchId = process.env.DEMO_BRANCH_ID ?? "";
await tryShot(staff, "reception", "11-tv.png", async () => {
  if (!branchId) throw new Error("DEMO_BRANCH_ID غير مضبوط");
  await staff.goto(`${BASE}/tv/${branchId}`, { waitUntil: "networkidle" });
});

// ══════════ المقطع ٣ — المالك ══════════
console.log("\n▸ المقطع ٣: المالك");
const ownerShots = [
  ["01-dashboard.png",  "/dashboard"],
  ["02-live-queue.png", "/dashboard/reception"],
  ["03-reports-peak.png", "/dashboard/reports"],
  ["05-insights.png",   "/dashboard/insights"],
  ["06-customers.png",  "/dashboard/customers"],
  ["07-menu.png",       "/dashboard/content"],
  ["08-branches.png",   "/dashboard/manage"],
  ["09-staff.png",      "/dashboard/staff"],
];
for (const [file, route] of ownerShots) {
  await tryShot(staff, "owner", file, async () => {
    await staff.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  });
}
// ٠٤ العائدون: نفس صفحة التقارير بعد تمرير
await tryShot(staff, "owner", "04-reports-returning.png", async () => {
  await staff.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle" });
  await ready(staff);
  await staff.evaluate(() => window.scrollBy({ top: 900, behavior: "instant" }));
});
// ١٠ إعدادات الفرع
await tryShot(staff, "owner", "10-branch-settings.png", async () => {
  await staff.goto(`${BASE}/dashboard/manage`, { waitUntil: "networkidle" });
  await ready(staff);
  await staff.evaluate(() => window.scrollBy({ top: 500, behavior: "instant" }));
});

await browser.close();

// ══ التقرير ══
console.log(`\n════ التقط ${taken.length} لقطة ════`);
if (missing.length) {
  console.log(`\n✗ تعذّرت ${missing.length} لقطة — لم يُصنع لها بديلٌ مرسوم:`);
  for (const m of missing) console.log(`   ${m.shot}\n     السبب: ${m.reason}`);
}
fs.writeFileSync(path.join(OUT, "capture-report.json"),
  JSON.stringify({ taken, missing, at: new Date().toISOString() }, null, 2));
console.log(`\nالتقرير: ${path.join(OUT, "capture-report.json")}`);
