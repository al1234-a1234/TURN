"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/database.types";

async function firstBranch() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, branchId: null as string | null };
  const { data: staff } = await supabase
    .from("staff").select("restaurant_id").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!staff) return { supabase, branchId: null };
  const { data: branch } = await supabase
    .from("branches").select("id").eq("restaurant_id", staff.restaurant_id).order("created_at").limit(1).maybeSingle();
  return { supabase, branchId: branch?.id ?? null };
}

function intOr(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

export async function addTable(formData: FormData) {
  const { supabase, branchId } = await firstBranch();
  if (!branchId) return;
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;
  const zoneRaw = String(formData.get("zone") ?? "inside");
  const zone = zoneRaw === "outside" ? "outside" : "inside";

  const row: TablesInsert<"tables"> = {
    branch_id: branchId,
    label,
    zone,
    seats: intOr(formData.get("seats"), 4),
    is_active: true,
  };
  // RLS يفرض is_manager_of عبر سياسة "managers manage tables"
  await supabase.from("tables").insert(row);
  revalidatePath("/dashboard/tables");
}

export async function deleteTable(formData: FormData) {
  const id = String(formData.get("table_id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("tables").delete().eq("id", id);
  revalidatePath("/dashboard/tables");
}
