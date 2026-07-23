"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";

const TIERS = ["regular", "silver", "gold", "vip"];

async function resolveRestaurant() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, rid: null as string | null };
  const { data } = await supabase
    .from("staff")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return { supabase, rid: data?.restaurant_id ?? null };
}

export async function updateCustomerProfile(
  customerId: string,
  patch: { is_vip?: boolean; tier?: string; note?: string | null; is_blocked?: boolean },
) {
  const { supabase, rid } = await resolveRestaurant();
  if (!rid || !customerId) return;

  const update: TablesUpdate<"customer_restaurant"> = {};
  if (patch.is_vip !== undefined) update.is_vip = patch.is_vip;
  if (patch.is_blocked !== undefined) update.is_blocked = patch.is_blocked;
  if (patch.tier !== undefined && TIERS.includes(patch.tier)) update.tier = patch.tier;
  if (patch.note !== undefined) update.note = patch.note?.trim() || null;
  if (Object.keys(update).length === 0) return;

  // RLS يفرض staff_has_perm(rid,'customers') — المفتاح المركّب (المطعم + العميل)
  await supabase
    .from("customer_restaurant")
    .update(update)
    .eq("restaurant_id", rid)
    .eq("customer_id", customerId);

  revalidatePath("/dashboard/customers");
}
