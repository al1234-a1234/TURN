import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  getEnabledModules,
  type ModuleKey,
  type StaffPermissionMap,
} from "@/lib/features";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type OwnerRestaurant = { id: string; name: string; slug: string };

/** كوكي اختيار المطعم لمشرف المنصّة (يعرض لوحة أي مطعم كاملة). */
export const ADMIN_RID_COOKIE = "admin_rid";

export type OwnerContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  email: string | null;
  restaurant: OwnerRestaurant;
  role: Database["public"]["Enums"]["user_role"];
  permissions: StaffPermissionMap;
  modules: Set<ModuleKey>;
  /** الفرع المربوط بالحساب — كل حساب مستقل يرى فرعه فقط (نموذج الفرانشايز).
   *  null = حساب غير مربوط بفرع (مشرف منصّة/مالك علامة) يرى كل الفروع. */
  branchId: string | null;
  branchName: string | null;
  /** true إذا كان الداخل مشرف منصّة يعرض هذا المطعم (لا مالكه الفعلي). */
  isAdminView: boolean;
};

/**
 * يحصر قائمة معرّفات الفروع في فرع الحساب المربوط (عزل الفرانشايز).
 * حساب غير مربوط (branchId=null) يرى كل الفروع كما هي.
 */
export function scopeBranchIds(ctx: OwnerContext, allIds: string[]): string[] {
  if (!ctx.branchId) return allIds;
  return allIds.filter((id) => id === ctx.branchId);
}

export type OwnerLoad =
  | { state: "no_user" }
  | { state: "no_restaurant"; email: string | null; isAdmin: boolean; supabase: SupabaseClient<Database> }
  | { state: "ok"; ctx: OwnerContext };

/**
 * يحمّل سياق المالك/الموظف مرة واحدة: المطعم، الدور، الصلاحيات، والموديولات المُفعّلة.
 * تستخدمه كل صفحات لوحة المالك لتفادي تكرار الاستعلامات.
 */
export async function loadOwner(): Promise<OwnerLoad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "no_user" };

  // مشرف المنصّة يُفحص أولًا ومرّة واحدة: هويته الإدارية لا يجوز أن تُبتلع
  // بصفّ staff عرَضي قديم (مثلًا مطعم تجريبي أُنشئ يومًا بلا owner_email فصار
  // هو مالكه المؤقت افتراضيًّا — migration 0010). بلا هذا الفحص المبكر، مشرف
  // له صفّ staff متروك في أي مطعم يُسجَّل دخوله فيه مباشرة كأنه مالكه الحقيقي.
  const { data: adminCheck } = await supabase.rpc("is_platform_admin");
  const isAdmin = !!adminCheck;

  // أولوية «عرض المشرف»: عند وجود كوكي admin_rid وكان المستخدم مشرف منصّة،
  // نعرض المطعم المختار حتمًا (حتى لو كان المشرف موظفًا في مطاعم أخرى).
  const store = await cookies();
  const adminRid = store.get(ADMIN_RID_COOKIE)?.value;
  if (adminRid && isAdmin) {
    const { data: rest } = await supabase
      .from("restaurants")
      .select("id, name, slug")
      .eq("id", adminRid)
      .maybeSingle();
    if (rest) {
      const modules = await getEnabledModules(supabase, rest.id);
      return {
        state: "ok",
        ctx: {
          supabase,
          userId: user.id,
          email: user.email ?? null,
          restaurant: rest as OwnerRestaurant,
          role: "owner",
          permissions: {},
          modules,
          branchId: null,
          branchName: null,
          isAdminView: true,
        },
      };
    }
  }

  // مشرف بلا كوكي اختيار مطعم → لوحة الأدمِن دائمًا، لا صفّ staff عرَضي
  if (isAdmin) {
    return { state: "no_restaurant", email: user.email ?? null, isAdmin, supabase };
  }

  const { data: staffRows } = await supabase
    .from("staff")
    .select("role, permissions, branch_id, restaurants(id, name, slug), branches(id, name)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    // ترتيب الأدوار في enum: owner < manager < staff < host — يفضّل المطعم الذي تملكه
    .order("role")
    .limit(1);

  const staff = staffRows?.[0];
  const restaurant = staff?.restaurants as OwnerRestaurant | undefined;
  const boundBranch = staff?.branches as { id: string; name: string } | null | undefined;

  if (!staff || !restaurant) {
    return { state: "no_restaurant", email: user.email ?? null, isAdmin, supabase };
  }

  const modules = await getEnabledModules(supabase, restaurant.id);

  return {
    state: "ok",
    ctx: {
      supabase,
      userId: user.id,
      email: user.email ?? null,
      restaurant,
      role: staff.role,
      permissions: (staff.permissions ?? {}) as StaffPermissionMap,
      modules,
      branchId: staff.branch_id ?? null,
      branchName: boundBranch?.name ?? null,
      isAdminView: false,
    },
  };
}
