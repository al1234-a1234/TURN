import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * إنشاء/إعادة ضبط حسابات الموظفين — يستدعيها **مالك المطعم نفسه** من لوحته.
 * قبلها كان إنشاء حساب استقبال يتطلّب SQL يدويًّا من إدارة المنصّة، فيستحيل
 * استضافة عشرات المطاعم. الآن كل مالك يجهّز فريقه بنفسه.
 *
 * الحارس: المُنادي مالك/مدير في **نفس** المطعم (أو أدمِن منصّة). التحقّق يتم
 * بمفتاح الخدمة داخل الدالة — لا يُصدَّق أي معرّف مطعم يرسله العميل.
 *
 * عزل الفرانشايز: هذه الدالة تعمل بمفتاح الخدمة فتتجاوز RLS، فتفحص الفرع
 * بنفسها — مدير مربوط بفرع لا ينشئ حسابًا لفرع آخر ولا حسابًا بلا فرع
 * (لأن «بلا فرع» يساوي وصولًا لكل الفروع)، ولا يعيد ضبط رمز موظّف خارج فرعه.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/** رمز مقروء: بلا أحرف ملتبسة (0/O، 1/I) كي يُملى هاتفيًّا بلا خطأ. */
function genCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rnd = new Uint32Array(len);
  crypto.getRandomValues(rnd);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[rnd[i] % alphabet.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!jwt) return json(401, { error: "unauthorized" });
  const { data: userData, error: uErr } = await admin.auth.getUser(jwt);
  if (uErr || !userData?.user) return json(401, { error: "unauthorized" });
  const callerId = userData.user.id;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }); }

  const action = String(body.action ?? "create");

  // ── الصلاحية: مالك/مدير في هذا المطعم، أو أدمِن منصّة ──
  const { data: adminRow } = await admin
    .from("platform_admins").select("user_id").eq("user_id", callerId).maybeSingle();
  const isPlatformAdmin = !!adminRow;

  const { data: callerStaff } = await admin
    .from("staff")
    .select("restaurant_id, role, branch_id")
    .eq("user_id", callerId)
    .eq("is_active", true)
    .in("role", ["owner", "manager"]);

  const rows = callerStaff ?? [];
  const managedIds = new Set(rows.map((s) => s.restaurant_id as string));

  /**
   * فرع المُنادي في مطعم بعينه: null يعني «مستوى العلامة» (يدير كل الفروع).
   * إن كان له أكثر من صف، الأوسع صلاحيةً (بلا فرع) يفوز.
   */
  function callerBranchFor(restId: string): string | null {
    if (isPlatformAdmin) return null;
    const mine = rows.filter((s) => s.restaurant_id === restId);
    if (mine.some((s) => s.branch_id == null)) return null;
    return (mine[0]?.branch_id as string | undefined) ?? null;
  }

  // ── إعادة ضبط رمز موظّف قائم ──
  if (action === "reset") {
    const staffId = String(body.staff_id ?? "");
    if (!staffId) return json(400, { error: "missing_fields" });

    const { data: target } = await admin
      .from("staff").select("user_id, restaurant_id, role, branch_id").eq("id", staffId).maybeSingle();
    if (!target) return json(404, { error: "not_found" });
    if (!isPlatformAdmin && !managedIds.has(target.restaurant_id as string)) {
      return json(403, { error: "forbidden" });
    }
    // المالك لا يُعاد ضبطه إلا من أدمِن المنصّة
    if (target.role === "owner" && !isPlatformAdmin) return json(403, { error: "forbidden_owner" });

    // عزل الفرانشايز: المربوط بفرع لا يمسّ موظّف فرع آخر ولا موظّف العلامة
    const cb = callerBranchFor(target.restaurant_id as string);
    if (cb && target.branch_id !== cb) return json(403, { error: "forbidden_branch" });

    const code = genCode(8);
    const { error: upErr } = await admin.auth.admin.updateUserById(
      target.user_id as string, { password: code },
    );
    if (upErr) return json(400, { error: "reset_failed", detail: upErr.message });

    const { data: u } = await admin.auth.admin.getUserById(target.user_id as string);
    const username = String(u?.user?.email ?? "").replace("@turn.app", "");
    return json(200, { username, code });
  }

  // ── إنشاء حساب موظّف جديد ──
  const restaurantId = String(body.restaurant_id ?? "");
  if (!restaurantId) return json(400, { error: "missing_fields" });
  if (!isPlatformAdmin && !managedIds.has(restaurantId)) return json(403, { error: "forbidden" });

  const username = String(body.username ?? "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  const displayName = String(body.name ?? "").trim() || "موظّف";
  let branchId = String(body.branch_id ?? "").trim() || null;
  const rawPerms = (body.permissions ?? {}) as Record<string, boolean>;

  if (!username) return json(400, { error: "missing_fields" });

  // الصلاحيات المسموح منحها من المالك (لا ترقية لمالك/مدير من هنا)
  const ALLOWED = ["waitlist", "reservations", "customers", "loyalty", "reviews", "analytics", "settings", "team", "menu"];
  const permissions: Record<string, boolean> = {};
  for (const k of ALLOWED) if (rawPerms[k] === true) permissions[k] = true;
  if (Object.keys(permissions).length === 0) permissions.waitlist = true; // استقبال افتراضًا

  // عزل الفرانشايز: المربوط بفرع ينشئ في فرعه فقط — ولو أرسل فرعًا آخر أو null
  const callerBranch = callerBranchFor(restaurantId);
  if (callerBranch) {
    if (branchId && branchId !== callerBranch) return json(403, { error: "forbidden_branch" });
    branchId = callerBranch;
  }

  // الفرع (إن مُرِّر) لا بد أن يكون تابعًا لهذا المطعم
  if (branchId) {
    const { data: b } = await admin
      .from("branches").select("id").eq("id", branchId).eq("restaurant_id", restaurantId).maybeSingle();
    if (!b) return json(400, { error: "bad_branch" });
  }

  const email = `${username}@turn.app`;
  const code = genCode(8);

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password: code,
    email_confirm: true,
    user_metadata: { username, role: "host" },
  });
  if (cErr || !created?.user) return json(409, { error: "username_taken", detail: cErr?.message });

  const { error: sErr } = await admin.from("staff").insert({
    user_id: created.user.id,
    restaurant_id: restaurantId,
    branch_id: branchId,
    role: "host",
    is_active: true,
    permissions,
    name: displayName,
  });
  if (sErr) {
    await admin.auth.admin.deleteUser(created.user.id); // لا نترك حسابًا يتيمًا
    return json(400, { error: "staff_failed", detail: sErr.message });
  }

  return json(200, { username, code, name: displayName });
});
