"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/database.types";

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

function intOr(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

export async function saveLoyaltyProgram(formData: FormData) {
  const { supabase, rid } = await resolveRestaurant();
  if (!rid) return;

  const program: TablesInsert<"loyalty_programs"> = {
    restaurant_id: rid,
    is_active: formData.get("is_active") === "on",
    points_per_visit: intOr(formData.get("points_per_visit"), 1),
    reward_threshold: intOr(formData.get("reward_threshold"), 10),
    reward_description: String(formData.get("reward_description") ?? "").trim() || null,
  };

  // RLS يفرض staff_has_perm(rid,'loyalty')
  await supabase.from("loyalty_programs").upsert(program, { onConflict: "restaurant_id" });
  revalidatePath("/dashboard/loyalty");
}
