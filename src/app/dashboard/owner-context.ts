import { createClient } from "@/lib/supabase/server";
import {
  getEnabledModules,
  type ModuleKey,
  type StaffPermissionMap,
} from "@/lib/features";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type OwnerRestaurant = { id: string; name: string; slug: string };

export type OwnerContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  email: string | null;
  restaurant: OwnerRestaurant;
  role: Database["public"]["Enums"]["user_role"];
  permissions: StaffPermissionMap;
  modules: Set<ModuleKey>;
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

  const { data: staffRows } = await supabase
    .from("staff")
    .select("role, permissions, restaurants(id, name, slug)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);

  const staff = staffRows?.[0];
  const restaurant = staff?.restaurants as OwnerRestaurant | undefined;

  if (!staff || !restaurant) {
    const { data: isAdmin } = await supabase.rpc("is_platform_admin");
    return { state: "no_restaurant", email: user.email ?? null, isAdmin: !!isAdmin, supabase };
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
    },
  };
}
