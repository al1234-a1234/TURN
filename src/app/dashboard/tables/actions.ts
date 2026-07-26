"use server";

import { revalidatePath } from "next/cache";
import { requirePerm, callerBranchIds, resolveWriteBranch } from "../guard";
import type { TablesInsert } from "@/lib/supabase/database.types";

function intOr(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

export async function addTable(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  // الفرع المختار من المبدّل، لا الفرع الأقدم دائمًا — وإلا هبطت طاولات
  // كل الفروع في الفرع الأوّل ولم يقدر بقيّة الفروع على إضافة طاولة أبدًا.
  const branchId = await resolveWriteBranch(caller, String(formData.get("branch_id") ?? ""));
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
  await caller.supabase.from("tables").insert(row);
  revalidatePath("/dashboard/tables");
}

export async function deleteTable(formData: FormData) {
  const id = String(formData.get("table_id") ?? "");
  if (!id) return;
  const caller = await requirePerm("settings");
  if (!caller) return;
  await caller.supabase
    .from("tables")
    .delete()
    .eq("id", id)
    .in("branch_id", await callerBranchIds(caller));
  revalidatePath("/dashboard/tables");
}
