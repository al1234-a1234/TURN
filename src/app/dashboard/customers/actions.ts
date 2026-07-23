"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";
import type { TablesUpdate } from "@/lib/supabase/database.types";

const TIERS = ["regular", "silver", "gold", "vip"];

export async function updateCustomerProfile(
  customerId: string,
  patch: { is_vip?: boolean; tier?: string; note?: string | null; is_blocked?: boolean },
) {
  const caller = await requirePerm("customers");
  if (!caller || !customerId) return;

  const update: TablesUpdate<"customer_restaurant"> = {};
  if (patch.is_vip !== undefined) update.is_vip = patch.is_vip;
  if (patch.is_blocked !== undefined) update.is_blocked = patch.is_blocked;
  if (patch.tier !== undefined && TIERS.includes(patch.tier)) update.tier = patch.tier;
  if (patch.note !== undefined) update.note = patch.note?.trim() || null;
  if (Object.keys(update).length === 0) return;

  // RLS يفرض staff_has_perm(rid,'customers') — المفتاح المركّب (المطعم + العميل)
  await caller.supabase
    .from("customer_restaurant")
    .update(update)
    .eq("restaurant_id", caller.restaurantId)
    .eq("customer_id", customerId);

  revalidatePath("/dashboard/customers");
}
