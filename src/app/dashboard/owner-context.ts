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
  /** true إذا كان الداخل مشرف منصّة يعرض هذا المطعم (لا مالكه الفعلي). */
  isAdminView: boolean;
};

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

  // أولوية «عرض المشرف»: عند وجود كوكي admin_rid وكان المستخدم مشرف منصّة،
  // نعرض المطعم المختار حتمًا (حتى لو كان المشرف موظفًا في مطاعم أخرى).
  const store = await cookies();
  const adminRid = store.get(ADMIN_RID_COOKIE)?.value;
  let isAdmin = false;
  if (adminRid) {
    const { data } = await supabase.rpc("is_platform_admin");
    isAdmin = !!data;
    if (isAdmin) {
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
            isAdminView: true,
          },
        };
      }
    }
  }

  const { data: staffRows } = await supabase
    .from("staff")
    .select("role, permissions, restaurants(id, name, slug)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    // ترتيب الأدوار في enum: owner < manager < staff < host — يفضّل المطعم الذي تملكه
    .order("role")
    .limit(1);

  const staff = staffRows?.[0];
  const restaurant = staff?.restaurants as OwnerRestaurant | undefined;

  if (!staff || !restaurant) {
    // نتفادى تكرار استدعاء is_platform_admin إن سبق فحصه أعلاه
    if (!adminRid) {
      const { data } = await supabase.rpc("is_platform_admin");
      isAdmin = !!data;
    }
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
      isAdminView: false,
    },
  };
}
