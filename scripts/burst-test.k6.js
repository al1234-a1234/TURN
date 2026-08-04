/**
 * اختبار الاندفاع — تزامنٌ لا حجم. يُشغَّل من جهاز المالك (البي سي):
 *   k6 run scripts/burst-test.k6.js
 *
 * الفرق عن load-test.k6.js: ذاك يقيس تصفّحًا هادئًا ممتدًّا؛ وهذا يقيس
 * أسوأ دقائق الجمعة — عشرات ينضمّون في الثانية نفسها على فروع متفرّقة —
 * عبر كل الطبقات الحقيقية (شبكة سعودية ← Vercel ← PostgREST ← القاعدة)،
 * وهو ما لا تراه قياسات SQL من داخل القاعدة.
 *
 * ⚠️ يكتب صفوفًا حقيقية. لذلك:
 *   - يُشغَّل على المطاعم الوهمية «قبل» تنظيفها (تُحذف الصفوف معها)،
 *     أو في نافذة ميّتة مع تنظيف يدويّ بعده.
 *   - لا يُشغَّل أبدًا وقت خدمة حقيقية.
 *
 * التشغيل:
 *   SUPABASE_URL=https://nkdfxmjuigslmangzuua.supabase.co \
 *   SUPABASE_ANON_KEY=<المفتاح العام> \
 *   BRANCH_IDS=<uuid,uuid,...>          # فروع المطاعم الوهمية
 *   k6 run scripts/burst-test.k6.js
 *
 * النجاح: p95 للانضمام < ٨٠٠ م.ث، وأخطاء غير P0429 أقل من ٠٫٥٪.
 * (P0429 متوقَّع بالتصميم إذا تجاوز فرعٌ ٦٠/دقيقة — يُحصى منفصلًا.)
 */
import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

const SUPA = __ENV.SUPABASE_URL;
const ANON = __ENV.SUPABASE_ANON_KEY;
const BRANCHES = (__ENV.BRANCH_IDS || "").split(",").filter(Boolean);

const joinTime = new Trend("join_duration", true);
const rateLimited = new Counter("join_rate_limited");   // P0429 — سلوك مقصود لا فشل
const hardFail = new Counter("join_hard_fail");

export const options = {
  scenarios: {
    // ذروة جمعة: ١٥ انضمامًا/ثانية موزّعة على الفروع، خمس دقائق متّصلة
    friday_burst: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.RATE || 15),
      timeUnit: "1s",
      duration: __ENV.DURATION || "5m",
      preAllocatedVUs: 60,
      maxVUs: 200,
    },
  },
  thresholds: {
    join_duration: ["p(95)<800"],
    join_hard_fail: ["count<25"],
  },
};

export default function () {
  const branch = BRANCHES[Math.floor(Math.random() * BRANCHES.length)];
  // رقم فريد لكل نداء: حدّ «٣ للرقم/١٠ دقائق» يخصّ العبث لا هذا الاختبار
  const phone = "059" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");

  const res = http.post(
    `${SUPA}/rest/v1/rpc/join_waitlist_guest`,
    JSON.stringify({
      p_branch_id: branch,
      p_full_name: "اختبار اندفاع",
      p_phone: phone,
      p_party_size: 2,
      p_zone: "inside",
    }),
    {
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      timeout: "10s",
    },
  );

  joinTime.add(res.timings.duration);
  const limited = res.status === 400 && String(res.body).includes("P0429");
  if (limited) rateLimited.add(1);
  else if (res.status >= 400) hardFail.add(1);

  check(res, { "انضمام ناجح أو محدود عمدًا": (r) => r.status < 400 || limited });
}
