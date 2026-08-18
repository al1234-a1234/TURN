/**
 * سكربت الحمل — k6
 *
 * يصعد: ١٠ ← ٢٥ ← ٥٠ ← ١٠٠ مطعم · عشر دقائق لكل درجة · تهدئةٌ دقيقتان بينها.
 *
 * ⚠ حدٌّ يجب أن تعرفه قبل أن تثق بالنتيجة:
 * كتابات العميل في التطبيق تمرّ بـServer Actions في Next.js، وهي ليست نقاط
 * نهايةٍ عاديّة تُنادى من أداة حمل (تحتاج ترويسة Next-Action وحمولةً مُرمَّزة
 * تتغيّر مع كل بناء). فالسكربت يقود:
 *   • القراءات والصفحات ← عبر نقاط النهاية الحقيقيّة (تحمّل Vercel وISR)
 *   • الكتابات          ← عبر دوالّ RPC نفسها التي تناديها تلك الإجراءات
 * أي أنّه يُحمّل **القاعدة وبركة PostgREST تحميلًا كاملًا**، ويُحمّل طبقة
 * Next.js **جزئيًّا** (الصفحات نعم، الإجراءات لا). وهذا كافٍ للسؤال الذي
 * بُنيت لأجله المحاكاة — تشبّع البركة وتزامن الدوالّ — وغير كافٍ لقياس
 * كلفة الإجراءات نفسها. لا تعمّم النتيجة إلى ما لم يُقَس.
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

const URL_ = __ENV.SUPABASE_URL;
const ANON = __ENV.SUPABASE_ANON_KEY;
const SERVICE = __ENV.SUPABASE_SERVICE_KEY;
const TARGET = __ENV.TARGET_URL;

const sessions = new SharedArray("sessions", () => {
  const s = JSON.parse(open("./sessions.json"));
  return [s];
})[0];

const owners = sessions.owners;
const reception = sessions.reception;

// ── معدّلات مشتقّة من القياس: ~٠٫٥ طلب/ث لكل مطعم ──
// SIM_STAGE (اختياريّ): درجةٌ واحدة فقط (١٠/٢٥/٥٠/١٠٠) — للتصعيد التسلسليّ
// الحقيقيّ حيث يُشغَّل 04_verify.sql بين كل درجةٍ وأخرى ويُقرَّر الاستمرار
// من خارج هذا الملفّ. بلا SIM_STAGE يعمل الملفّ كما في الدليل: أربع درجاتٍ
// متتاليةٌ بلا توقّفٍ للتحقّق بينها (للتشغيل اليدويّ من طرفيّةٍ واحدة).
const ALL_STAGES = [10, 25, 50, 100];
const STAGES = __ENV.SIM_STAGE ? [Number(__ENV.SIM_STAGE)] : ALL_STAGES;
const MIN = 60;
const HOLD = 10 * MIN;
const COOL = 2 * MIN;

/** يبني مراحل k6 من درجات المطاعم مع تهدئةٍ بينها. */
function stagesFor(perRestaurant) {
  const out = [];
  for (const n of STAGES) {
    out.push({ duration: "30s", target: Math.ceil(n * perRestaurant) });
    out.push({ duration: `${HOLD}s`, target: Math.ceil(n * perRestaurant) });
    out.push({ duration: `${COOL}s`, target: Math.max(1, Math.ceil(n * perRestaurant * 0.1)) });
  }
  return out;
}

export const options = {
  discardResponseBodies: false,
  scenarios: {
    // موظّفو الاستقبال: نبضة queue_version كل ١٠ث + إجلاسٌ من حينٍ لآخر
    reception: { executor: "ramping-vus", startVUs: 1, stages: stagesFor(2.7), exec: "receptionist", gracefulRampDown: "30s" },
    // شاشات العرض: tv_queue كل ١٠ث، مفتوحةٌ طوال التشغيل
    tv:        { executor: "ramping-vus", startVUs: 1, stages: stagesFor(1.3), exec: "tvScreen", gracefulRampDown: "30s" },
    // الملّاك: لوحةٌ وتقارير كل بضع دقائق
    owner:     { executor: "ramping-vus", startVUs: 1, stages: stagesFor(1.0), exec: "ownerDash", gracefulRampDown: "30s" },
    // العملاء: رحلةٌ كاملة — صفحة، انضمام، استطلاع، وإلغاءٌ أو حجز
    guests:    { executor: "ramping-arrival-rate", startRate: 1, timeUnit: "1m",
                 preAllocatedVUs: 200, maxVUs: 2000,
                 stages: STAGES.flatMap((n) => ([
                   { duration: "30s", target: Math.ceil(n * 0.4) },
                   { duration: `${HOLD}s`, target: Math.ceil(n * 0.4) },
                   { duration: `${COOL}s`, target: 1 },
                 ])), exec: "guestJourney" },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.01", abortOnFail: false }],
    http_req_duration: ["p(95)<2000"],
  },
};

// أسماء المقاييس هنا يجب أن تكون ASCII بحتة — قيدٌ من k6 نفسه (حتى ١٢٨ حرفًا
// إنجليزيًّا/رقمًا/شرطة سفلية). اسمٌ عربيّ هنا يُسقط السكربت كاملًا بخطأٍ
// فوريّ (GoError: Invalid metric name) قبل أن يُرسَل طلبٌ واحد.
const joins = new Counter("behavior_joins");
const cancels = new Counter("behavior_cancels");
const books = new Counter("behavior_bookings");
const seats = new Counter("behavior_seats");
const ticketPoll = new Trend("ticket_poll_duration", true);

const rpcAnon = (fn, body) =>
  http.post(`${URL_}/rest/v1/rpc/${fn}`, JSON.stringify(body), {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    tags: { path: fn },
  });

const rpcSvc = (fn, body) =>
  http.post(`${URL_}/rest/v1/rpc/${fn}`, JSON.stringify(body), {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    tags: { path: fn },
  });

const rpcAuth = (fn, body, token) =>
  http.post(`${URL_}/rest/v1/rpc/${fn}`, JSON.stringify(body), {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    tags: { path: fn },
  });

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ══ العميل: صفحة → انضمام → استطلاع → إلغاء (٢٠٪) أو حجز (١٠٪) ══
export function guestJourney() {
  const owner = pick(owners);
  const branchId = pick(owner.branch_ids);
  const phone = "0599" + String(Math.floor(Math.random() * 1e6)).padStart(6, "0");

  group("الصفحة العامّة", () => {
    const r = http.get(`${TARGET}/r/${owner.slug}`, { tags: { path: "/r/[slug]" } });
    check(r, { "صفحة المطعم 200": (x) => x.status === 200 });
    rpcAnon("waitlist_counts_for", { p_branch_ids: [branchId] });
  });

  if (Math.random() < 0.1) {
    // ١٠٪ يحجزون بدل الانضمام
    const at = new Date(Date.now() + 864e5).toISOString();
    const r = rpcSvc("book_reservation_guest", {
      p_branch_id: branchId, p_full_name: "ضيف محاكاة", p_phone: phone,
      p_reserved_at: at, p_party_size: 2, p_zone: "inside", p_notes: null,
    });
    if (r.status === 200) books.add(1);
    return;
  }

  const j = rpcSvc("join_waitlist_guest", {
    p_branch_id: branchId, p_full_name: "ضيف محاكاة", p_phone: phone,
    p_party_size: 2, p_zone: "inside",
  });
  if (j.status !== 200) return;
  joins.add(1);

  let entryId = null;
  try { const b = j.json(); entryId = b?.entry_id ?? b?.id ?? null; } catch { /* تجاهل */ }
  if (!entryId) return;

  // يستطلع تذكرته — كما تفعل الواجهة: ١٠ث حين يقترب دوره
  for (let i = 0; i < 8; i++) {
    const t = rpcAnon("waitlist_ticket_status", { p_entry_id: entryId, p_phone: phone });
    ticketPoll.add(t.timings.duration);
    sleep(10);
  }

  if (Math.random() < 0.2) {
    const c = rpcSvc("cancel_waitlist_guest", { p_entry_id: entryId, p_phone: phone });
    if (c.status === 200) cancels.add(1);
  }
}

// ══ الاستقبال: نبضة كل ١٠ث + لوحةٌ عند التغيّر + إجلاس ══
export function receptionist() {
  const me = pick(reception);
  const v = rpcAuth("queue_version", { p_branch_id: me.branch_id }, me.token);
  check(v, { "نبضة الطابور 200": (x) => x.status === 200 });

  // كل ~٦ دورات يفتح اللوحة كاملةً (كما يفعل router.refresh عند تغيّر النبضة)
  if (Math.random() < 0.17) {
    const q = rpcAuth("staff_branch_queue", { p_branch_id: me.branch_id }, me.token);
    check(q, { "لوحة الاستقبال 200": (x) => x.status === 200 });

    // يُجلس أوّل من ينتظر
    try {
      const rows = q.json();
      if (Array.isArray(rows) && rows.length) {
        const first = rows.find((r) => r.status === "waiting");
        if (first) {
          const s = http.patch(
            `${URL_}/rest/v1/waitlist_entries?id=eq.${first.entry_id ?? first.id}`,
            JSON.stringify({ status: "seated", seated_at: new Date().toISOString() }),
            { headers: { apikey: ANON, Authorization: `Bearer ${me.token}`, "Content-Type": "application/json" },
              tags: { path: "seat" } });
          if (s.status < 300) seats.add(1);
        }
      }
    } catch { /* تجاهل */ }
  }
  sleep(10);
}

// ══ شاشة العرض: tv_queue كل ١٠ث ══
export function tvScreen() {
  const me = pick(reception);
  const r = rpcAnon("tv_queue", { p_branch_id: me.branch_id });
  check(r, { "شاشة العرض 200": (x) => x.status === 200 });
  sleep(10);
}

// ══ المالك: لوحته وتقاريره كل بضع دقائق ══
export function ownerDash() {
  const me = pick(owners);
  const h = { apikey: ANON, Authorization: `Bearer ${me.token}` };
  http.get(`${URL_}/rest/v1/waitlist_entries?select=id,status&branch_id=eq.${me.branch_ids[0]}&limit=200`,
           { headers: h, tags: { path: "owner:queue" } });
  http.get(`${URL_}/rest/v1/customer_restaurant?select=visits,is_vip&restaurant_id=eq.${me.restaurant_id}`,
           { headers: h, tags: { path: "owner:customers" } });
  http.get(`${URL_}/rest/v1/daily_stats?select=*&limit=60`,
           { headers: h, tags: { path: "owner:stats" } });
  sleep(180 + Math.random() * 120);
}

export function handleSummary(data) {
  const m = data.metrics;
  return {
    stdout: `
════════════════════════════════════════════
  انتهى التشغيل — انقل هذه الأرقام إلى الجدول
  الدرجة: ${STAGES.join("، ")} مطعمًا
════════════════════════════════════════════
  إجماليّ الطلبات   : ${m.http_reqs?.values?.count ?? "—"}
  معدّل الخطأ       : ${((m.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}٪
  p50 / p95 / p99   : ${(m.http_req_duration?.values?.med ?? 0).toFixed(0)} / ${(m.http_req_duration?.values?.["p(95)"] ?? 0).toFixed(0)} / ${(m.http_req_duration?.values?.["p(99)"] ?? 0).toFixed(0)} ms
  انضمام / إلغاء    : ${m["سلوك_انضمام"]?.values?.count ?? 0} / ${m["سلوك_إلغاء"]?.values?.count ?? 0}
  حجز / إجلاس       : ${m["سلوك_حجز"]?.values?.count ?? 0} / ${m["سلوك_إجلاس"]?.values?.count ?? 0}

  ⚠ لا تكتب «نجح» قبل تشغيل 04_verify.sql — السرعة وحدها لا تكفي.
`,
  };
}
