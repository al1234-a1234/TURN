/**
 * كشف المحدِّدات — شغّله مرّةً واحدة قبل الالتقاط.
 *
 * لماذا يوجد: بعض الشاشات مكوّناتٌ تفاعليّة لم أستطع قراءة نصوصها من
 * الشيفرة الساكنة بثقة. وبدل أن أخمّن محدِّدًا يفشل عندك بصمت، يطبع هذا
 * السكربت **كلّ** زرٍّ وحقلٍ ظاهر في الصفحات الثلاث الحرجة، فتثبّت الصحيح
 * في selectors.json وتمضي.
 *
 *   node scripts/demo-video/discover.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.DEMO_SLUG ?? "alasalah";

const pages = [
  { name: "partners", url: `${BASE}/partners`, vp: { width: 1440, height: 900 } },
  { name: "restaurant", url: `${BASE}/r/${SLUG}`, vp: { width: 390, height: 844 } },
  { name: "reception", url: `${BASE}/dashboard/reception`, vp: { width: 1440, height: 900 } },
];

const browser = await chromium.launch();
const out = {};

for (const p of pages) {
  const ctx = await browser.newContext({ viewport: p.vp, locale: "ar-SA" });
  const page = await ctx.newPage();
  try {
    await page.goto(p.url, { waitUntil: "networkidle", timeout: 30000 });
    out[p.name] = await page.evaluate(() => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      return {
        buttons: [...document.querySelectorAll("button,[role=button],a[href]")]
          .filter(vis)
          .map((b) => ({ text: (b.innerText || "").trim().slice(0, 60), aria: b.getAttribute("aria-label"), title: b.getAttribute("title") }))
          .filter((b) => b.text || b.aria || b.title),
        inputs: [...document.querySelectorAll("input,select,textarea")]
          .filter(vis)
          .map((i) => ({ name: i.getAttribute("name"), type: i.getAttribute("type"), placeholder: i.getAttribute("placeholder") })),
      };
    });
    console.log(`✓ ${p.name}`);
  } catch (e) {
    out[p.name] = { error: String(e).slice(0, 200) };
    console.log(`✗ ${p.name} — ${String(e).slice(0, 120)}`);
  }
  await ctx.close();
}

await browser.close();
fs.writeFileSync(new URL("./discovered.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("\nكُتب discovered.json — ثبّت ما يلزم في selectors.json");
