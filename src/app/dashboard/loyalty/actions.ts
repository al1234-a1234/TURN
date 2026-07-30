"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";
import type { TablesInsert } from "@/lib/supabase/database.types";

function intOr(raw: FormDataEntryValue | null, fallback: number): number {
  const s = String(raw ?? "").trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

/**
 * الطبقات: المفاتيح ثابتة (تخزَّن في customer_restaurant.tier وتُصفّى بها
 * اللوحات)، والمالك يملك الاسم والعتبة والميزة. عتبة الذهبي تُجبَر أعلى من
 * الفضّي — إعداد مقلوب يجعل الترقية عشوائية.
 */
function tierConfig(formData: FormData) {
  const silverVisits = intOr(formData.get("tier_silver_visits"), 5);
  const goldVisits = Math.max(silverVisits + 1, intOr(formData.get("tier_gold_visits"), 15));
  return [
    { key: "silver", name: String(formData.get("tier_silver_name") ?? "").trim() || "فضّي",
      visits: silverVisits, perk: String(formData.get("tier_silver_perk") ?? "").trim() },
    { key: "gold", name: String(formData.get("tier_gold_name") ?? "").trim() || "ذهبي",
      visits: goldVisits, perk: String(formData.get("tier_gold_perk") ?? "").trim() },
  ];
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
    winback_value: (() => { const raw = String(formData.get("winback_value") ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))); const v = Number(raw); return Number.isFinite(v) && v > 0 ? v : null; })(),
    // الواجهة تسمّيها «نسبة الخصم ٪» — نثبّت الوحدة كي لا تُفسَّر 20 على أنها ريالات
    winback_value_kind: "percent",
    tier_config: tierConfig(formData),
  };

  // RLS يفرض staff_has_perm(rid,'loyalty')
  await caller.supabase.from("loyalty_programs").upsert(program, { onConflict: "restaurant_id" });
  revalidatePath("/dashboard/loyalty");
}
