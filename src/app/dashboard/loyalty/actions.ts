"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";
import type { TablesInsert } from "@/lib/supabase/database.types";

function intOr(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

export async function saveLoyaltyProgram(formData: FormData) {
  const caller = await requirePerm("loyalty");
  if (!caller) return;

  const program: TablesInsert<"loyalty_programs"> = {
    restaurant_id: caller.restaurantId,
    is_active: formData.get("is_active") === "on",
    points_per_visit: intOr(formData.get("points_per_visit"), 1),
    reward_threshold: intOr(formData.get("reward_threshold"), 10),
    reward_description: String(formData.get("reward_description") ?? "").trim() || null,
  };

  // RLS يفرض staff_has_perm(rid,'loyalty')
  await caller.supabase.from("loyalty_programs").upsert(program, { onConflict: "restaurant_id" });
  revalidatePath("/dashboard/loyalty");
}
