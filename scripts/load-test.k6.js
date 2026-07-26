/**
 * اختبار حمل «دور» — يُشغَّل من جهازك (لا من بيئة التطوير):
 *   brew install k6   ثم   k6 run scripts/load-test.k6.js
 *
 * يحاكي ذروة عشاء: زوّار الرئيسية، صفحات مطاعم، واستطلاع تذاكر.
 * ابدأ بـ VUS=50 وارفع تدريجيًّا (200 → 500) وراقب p95 و error rate،
 * وبالتوازي راقب لوحة Supabase (CPU/اتصالات) ولوحة Vercel.
 * لا تشغّله على الإنتاج وقت خدمة حقيقية — أو شغّله بحصص منخفضة.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "https://turn-alpha.vercel.app";
const SUPA = __ENV.SUPABASE_URL;           // اختياري: اختبار RPC مباشرة
const ANON = __ENV.SUPABASE_ANON_KEY;

export const options = {
  scenarios: {
    browsing: {   // ٧٠٪ تصفّح: رئيسية + صفحة مطعم
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: Number(__ENV.VUS || 50) },
        { duration: "3m", target: Number(__ENV.VUS || 50) },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],       // أقل من ١٪ أخطاء
    http_req_duration: ["p(95)<1500"],    // p95 تحت ١.٥ ثانية
  },
};

export default function () {
  const home = http.get(`${BASE}/`);
  check(home, { "home 200": (r) => r.status === 200 });
  sleep(Math.random() * 2 + 1);

  const rest = http.get(`${BASE}/r/eficto`);
  check(rest, { "restaurant 200": (r) => r.status === 200 });
  sleep(Math.random() * 2 + 1);

  // استطلاع تذكرة (إنوفّرت مفاتيح Supabase): يحاكي عملاء واقفين بالطابور
  if (SUPA && ANON && __ENV.ENTRY_ID && __ENV.PHONE) {
    const rpc = http.post(
      `${SUPA}/rest/v1/rpc/waitlist_ticket_status`,
      JSON.stringify({ p_entry_id: __ENV.ENTRY_ID, p_phone: __ENV.PHONE }),
      { headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` } },
    );
    check(rpc, { "ticket rpc 200": (r) => r.status === 200 });
  }
  sleep(Math.random() * 3 + 2);
}
