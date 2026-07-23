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

  const { data } = await supabase
    .from("staff")
    .select("role, permissions, restaurant_id")
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
      role: data.role,
      permissions: (data.permissions ?? {}) as StaffPermissionMap,
    };
  }

  // مشرف المنصّة يتصرّف كمالك على المطعم المختار (كوكي) — يقدر يدير أي مطعم
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (isAdmin) {
    const store = await cookies();
    const rid = store.get(ADMIN_RID_COOKIE)?.value;
    if (rid) {
      return { supabase, userId: user.id, restaurantId: rid, role: "owner", permissions: {} };
    }
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

/** معرّفات فروع مطعم المتصل — لتضييق التحديثات/الحذف على فروعه فقط (دفاع في العمق). */
export async function callerBranchIds(caller: Caller): Promise<string[]> {
  const { data } = await caller.supabase
    .from("branches")
    .select("id")
    .eq("restaurant_id", caller.restaurantId);
  return (data ?? []).map((b) => b.id);
}
