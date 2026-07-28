/**
 * اختبار حِمل «دور» — k6 (https://k6.io)
 *
 * يحاكي ليلة الذروة لخمسين مطعمًا: ضيوف يفتحون صفحة المطعم وصفحة المسح،
 * وعيّنة منهم تمسح فعليًّا (كتابة حقيقية عبر RPC) وتفتح «وضعي».
 *
 * التشغيل (من جهازك — بيئة الوكيل محجوبة عن النطاق):
 *   k6 run \
 *     -e BASE=https://YOUR-DOMAIN -e SLUG=eficto \
 *     -e SUPABASE_URL=https://nkdfxmjuigslmangzuua.supabase.co \
 *     -e SUPABASE_ANON_KEY=... \
 *     scripts/loadtest.js
 *
 * ⚠️ ينفّذ كتابات حقيقية بأرقام وهمية بادئتها 05055. شغّله على مطعم
 *    اختبار، ونظّف بعده:
 *      delete from customer_rewards where customer_id in
 *        (select id from customers where phone like '05055%');
 *      delete from checkins where customer_id in
 *        (select id from customers where phone like '05055%');
 *      delete from customer_restaurant where customer_id in
 *        (select id from customers where phone like '05055%');
 *      delete from customers where phone like '05055%';
 *      delete from rate_limits where key like 'checkin:p:5055%' or key like 'status:p:5055%';
 *
 * ملاحظة مهمة: حدّ المعدّل بالفرع (١٢٠ مسحة/ساعة) سيرُدّ rate_limited
 * عند الحِمل العالي — هذا سلوك صحيح مقصود لا فشل، لذلك يُحسب نجاحًا.
 *
 * العتبات من هدف العقد: p95 قراءة < 800ms، p95 كتابة < 1.5s، أخطاء < ١٪.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE || "https://turn-alpha.vercel.app";
const SLUG = __ENV.SLUG || "eficto";
const SB = __ENV.SUPABASE_URL || "";
const KEY = __ENV.SUPABASE_ANON_KEY || "";

export const options = {
  scenarios: {
    // ٥٠ مطعمًا × ~٦ ضيوف متزامنين في الذروة = ٣٠٠ مستخدم افتراضي
    peak_night: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 60 },
        { duration: "2m", target: 300 },
        { duration: "2m", target: 300 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: {
    "http_req_duration{kind:read}": ["p(95)<800"],
    "http_req_duration{kind:write}": ["p(95)<1500"],
    http_req_failed: ["rate<0.01"],
  },
};

const rpcHeaders = {
  "Content-Type": "application/json",
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

// رقم وهمي مميّز بادئته 05055 — يسهل تنظيفه دفعة واحدة
function fakePhone() {
  return "05055" + String(Math.floor(Math.random() * 100000)).padStart(5, "0");
}

export default function run() {
  // ١) صفحة المطعم (أثقل قراءة عامة: فروع + قائمة + عروض + تقييمات)
  const page = http.get(`${BASE}/r/${SLUG}`, { tags: { kind: "read" } });
  check(page, { "restaurant page 200": (r) => r.status === 200 });
  sleep(Math.random() * 2);

  // ٢) صفحة المسح
  const scan = http.get(`${BASE}/g/${SLUG}`, { tags: { kind: "read" } });
  check(scan, { "scan page 200": (r) => r.status === 200 });
  sleep(Math.random() * 2);

  if (!SB || !KEY) return; // بلا مفاتيح: قراءة فقط

  // ٣) ~٢٠٪ يمسحون فعليًّا (كتابة) ثم يفتحون «وضعي» (قراءة RPC)
  if (Math.random() < 0.2) {
    const phone = fakePhone();
    const ck = http.post(`${SB}/rest/v1/rpc/public_checkin`,
      JSON.stringify({ p_slug: SLUG, p_phone: phone }),
      { headers: rpcHeaders, tags: { kind: "write" } });
    check(ck, {
      // rate_limited ردّ مقصود تحت الضغط — حارس يعمل، لا عطل
      "checkin ok or rate_limited": (r) => {
        if (r.status !== 200) return false;
        const b = r.json();
        return b.ok === true || b.error === "rate_limited";
      },
    });

    const st = http.post(`${SB}/rest/v1/rpc/my_restaurant_status`,
      JSON.stringify({ p_slug: SLUG, p_phone: phone }),
      { headers: rpcHeaders, tags: { kind: "read" } });
    check(st, { "status rpc 200": (r) => r.status === 200 });
  }
  sleep(1 + Math.random() * 3);
}
