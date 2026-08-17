/**
 * توليد جلساتٍ حقيقيّة لموظّفي المحاكاة.
 *
 * لماذا هذا الملفّ هو نقطة الجدّيّة؟ لأنّ اختبار المسارات العامّة وحدها يقيس
 * نصف النظام. لوحة الاستقبال وشاشة المالك تمرّان بـRLS وبدوالّ SECURITY
 * DEFINER تفحص هويّة المتّصل — ولا يُقاس ذلك إلا بتوكنٍ حقيقيٍّ في الترويسة.
 *
 * ينشئ عبر Admin API: ١٠٠ مالك + ٢٠٠ استقبال، ويربطهم بصفوف staff،
 * ثمّ يسجّل دخولهم ويحفظ التوكنات في sessions.json.
 *
 * ⚠ sessions.json فيه توكناتٌ صالحة — لا يُرفع إلى git (مُستثنى في .gitignore).
 *
 * التشغيل:
 *   export SUPABASE_URL=... SUPABASE_SERVICE_KEY=... SUPABASE_ANON_KEY=...
 *   node 02_make_sessions.mjs
 */

import { writeFileSync } from "node:fs";

const URL_ = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!URL_ || !SERVICE || !ANON) {
  console.error("ينقص متغيّر بيئة: SUPABASE_URL / SUPABASE_SERVICE_KEY / SUPABASE_ANON_KEY");
  process.exit(1);
}
if (!/supabase\.co/.test(URL_)) {
  console.error("SUPABASE_URL لا يبدو رابط Supabase.");
  process.exit(1);
}

const PASSWORD = "SimLoad!2026#" + Math.random().toString(36).slice(2, 8);

const admin = (path, opts = {}) =>
  fetch(`${URL_}${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });

/** حارس: نرفض العمل على قاعدةٍ فيها مطاعم غير مبذورة (أي: الإنتاج). */
async function assertSimDatabase() {
  const res = await admin("/rest/v1/restaurants?select=slug&slug=not.like.sim-*&limit=1");
  const rows = await res.json();
  if (Array.isArray(rows) && rows.length > 0) {
    console.error("توقّف: القاعدة فيها مطاعم غير مبذورة — يبدو أنّها الإنتاج.");
    process.exit(1);
  }
}

async function createUser(email) {
  const res = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`إنشاء ${email} فشل: ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

async function signIn(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`دخول ${email} فشل: ${res.status}`);
  return (await res.json()).access_token;
}

const main = async () => {
  await assertSimDatabase();

  const rRes = await admin("/rest/v1/restaurants?select=id,slug&slug=like.sim-*&order=slug");
  const restaurants = await rRes.json();
  if (!restaurants.length) {
    console.error("لا مطاعم مبذورة — شغّل 01_seed.sql أوّلًا.");
    process.exit(1);
  }

  const bRes = await admin("/rest/v1/branches?select=id,restaurant_id&order=created_at");
  const branches = await bRes.json();
  const byRestaurant = new Map();
  for (const b of branches) {
    if (!byRestaurant.has(b.restaurant_id)) byRestaurant.set(b.restaurant_id, []);
    byRestaurant.get(b.restaurant_id).push(b.id);
  }

  const sessions = { password: PASSWORD, owners: [], reception: [] };
  const staffRows = [];

  for (const r of restaurants) {
    const brs = byRestaurant.get(r.id) ?? [];
    if (!brs.length) continue;

    // مالكٌ واحدٌ لكل مطعم — بلا حصرٍ بفرع، فيرى المطعم كلّه
    const oEmail = `owner-${r.slug}@sim.local`;
    const oId = await createUser(oEmail);
    staffRows.push({
      user_id: oId, restaurant_id: r.id, branch_id: null, role: "owner",
      permissions: {}, is_active: true,
    });
    sessions.owners.push({ email: oEmail, restaurant_id: r.id, slug: r.slug, branch_ids: brs });

    // استقبالان لكلّ فرع — بصلاحيّتَي الطابور والحجوزات، كحال الإنتاج
    for (let i = 0; i < 2; i++) {
      const branchId = brs[i % brs.length];
      const rEmail = `rec${i}-${r.slug}@sim.local`;
      const rId = await createUser(rEmail);
      staffRows.push({
        user_id: rId, restaurant_id: r.id, branch_id: branchId, role: "host",
        permissions: { waitlist: true, reservations: true, customers: true },
        is_active: true,
      });
      sessions.reception.push({ email: rEmail, restaurant_id: r.id, slug: r.slug, branch_id: branchId });
    }
    process.stdout.write(`\rحسابات: ${sessions.owners.length + sessions.reception.length}`);
  }

  // إدخال صفوف الموظّفين دفعةً واحدة
  const sRes = await admin("/rest/v1/staff", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(staffRows),
  });
  if (!sRes.ok) throw new Error(`إدخال staff فشل: ${await sRes.text()}`);

  // تسجيل الدخول واستخراج التوكنات
  console.log("\nتسجيل الدخول واستخراج التوكنات…");
  for (const s of [...sessions.owners, ...sessions.reception]) {
    s.token = await signIn(s.email);
  }

  writeFileSync("sessions.json", JSON.stringify(sessions, null, 2));
  console.log(`تمّ: ${sessions.owners.length} مالكًا · ${sessions.reception.length} استقبالًا → sessions.json`);
  console.log("⚠ لا ترفع sessions.json إلى git — فيه توكنات صالحة.");
};

main().catch((e) => { console.error("\n✗", e.message); process.exit(1); });
