import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { staffHasPermission, type StaffPermission, type StaffPermissionMap } from "@/lib/features";
import { ADMIN_RID_COOKIE } from "./owner-context";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * حارس السيرفر للإجراءات (server actions).
 *
 * ملاحظة أمنية: RLS في القاعدة يفرض عزل المطاعم (tenant isolation) على كل الجداول،
 * لكن جدولَي waitlist_entries و reservations يستخدمان is_staff_of (عضوية فقط) لا
 * الصلاحية الدقيقة. لذا نضيف فحص الصلاحية هنا في طبقة التطبيق — دفاعٌ في العمق،
 * ويسدّ فجوة الصلاحيات الدقيقة للموظفين. المالك/المدير يمرّان دائمًا.
 *
 * كما نستخدم نفس ترتيب loadOwner (`order("role")`) لاختيار المطعم، حتى لا تكتب
 * الإجراءات على مطعمٍ مختلف عمّا تعرضه اللوحة لمن هو موظف في أكثر من مطعم.
 */
export type Caller = {
  supabase: SupabaseClient<Database>;
  userId: string;
  restaurantId: string;
  /** الفرع المربوط بالحساب (عزل الفرانشايز) — null = غير مربوط (يرى كل الفروع). */
  branchId: string | null;
  role: Database["public"]["Enums"]["user_role"];
  permissions: StaffPermissionMap;
};

/** يحمّل المتصل الحالي ومطعمه (يفضّل المطعم الذي يملكه). null إن لم يكن موظفًا فعّالًا. */
export async function resolveCaller(): Promise<Caller | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // أولوية «عرض المشرف»: كوكي admin_rid + مشرف منصّة → يتصرّف كمالك للمطعم المختار
  const store = await cookies();
  const adminRid = store.get(ADMIN_RID_COOKIE)?.value;
  if (adminRid) {
    const { data: isAdmin } = await supabase.rpc("is_platform_admin");
    if (isAdmin) {
      return { supabase, userId: user.id, restaurantId: adminRid, branchId: null, role: "owner", permissions: {} };
    }
  }

  const { data } = await supabase
    .from("staff")
    .select("role, permissions, restaurant_id, branch_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("role")
    .limit(1)
    .maybeSingle();

  if (data?.restaurant_id) {
    return {
      supabase,
      userId: user.id,
      restaurantId: data.restaurant_id,
      branchId: data.branch_id ?? null,
      role: data.role,
      permissions: (data.permissions ?? {}) as StaffPermissionMap,
    };
  }
  return null;
}

/** يحمّل المتصل ويشترط صلاحية معيّنة. يعيد null إن لم يكن مخوّلًا (فشل صامت آمن). */
export async function requirePerm(perm: StaffPermission): Promise<Caller | null> {
  const caller = await resolveCaller();
  if (!caller) return null;
  if (!staffHasPermission(caller.role, caller.permissions, perm)) return null;
  return caller;
}

/** معرّفات فروع المتصل — لتضييق التحديثات/الحذف على فروعه فقط (دفاع في العمق).
 *  حساب مربوط بفرع → فرعه فقط؛ غير المربوط → كل فروع مطعمه. */
export async function callerBranchIds(caller: Caller): Promise<string[]> {
  if (caller.branchId) return [caller.branchId];
  const { data } = await caller.supabase
    .from("branches")
    .select("id")
    .eq("restaurant_id", caller.restaurantId);
  return (data ?? []).map((b) => b.id);
}

/**
 * الفرع الذي يُكتب إليه المحتوى (قائمة/عروض/صور).
 * حساب مربوط بفرع → فرعه حتمًا (يتجاهل ما أُرسل). غير المربوط → الفرع المُرسَل
 * بعد التحقّق أنه من مطعمه، وإلا أول فرع. يمنع الكتابة على فرع مطعم آخر.
 */
export async function resolveWriteBranch(
  caller: Caller,
  submitted?: string | null,
): Promise<string | null> {
  if (caller.branchId) return caller.branchId;
  const id = String(submitted ?? "").trim();
  const q = caller.supabase
    .from("branches").select("id")
    .eq("restaurant_id", caller.restaurantId).eq("is_active", true);
  const { data } = id
    ? await q.eq("id", id).maybeSingle()
    : await q.order("created_at").limit(1).maybeSingle();
  return data?.id ?? null;
}
