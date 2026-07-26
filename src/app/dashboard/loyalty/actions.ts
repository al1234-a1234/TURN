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
    winback_enabled: formData.get("winback_enabled") === "on",
    winback_title: String(formData.get("winback_title") ?? "").trim() || "اشتقنا لك — هدية عودة 🎁",
    winback_value: (() => { const v = Number(formData.get("winback_value")); return Number.isFinite(v) && v > 0 ? v : null; })(),
    // الواجهة تسمّيها «نسبة الخصم ٪» — نثبّت الوحدة كي لا تُفسَّر 20 على أنها ريالات
    winback_value_kind: "percent",
  };

  // RLS يفرض staff_has_perm(rid,'loyalty')
  await caller.supabase.from("loyalty_programs").upsert(program, { onConflict: "restaurant_id" });
  revalidatePath("/dashboard/loyalty");
}
