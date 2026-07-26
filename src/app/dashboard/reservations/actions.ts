"use server";

import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { requirePerm, callerBranchIds, resolveWriteBranch } from "../guard";
import { saudiMobile } from "@/lib/format";

type ResStatus = Database["public"]["Enums"]["reservation_status"];
const STATUSES: ResStatus[] = ["pending", "confirmed", "seated", "completed", "cancelled", "no_show"];

export async function createReservation(formData: FormData) {
  const caller = await requirePerm("reservations");
  if (!caller) return;
  // الفرع المختار من المبدّل — حجز الفرع الثاني كان يُقيَّد على الفرع الأوّل
  const branchId = await resolveWriteBranch(caller, String(formData.get("branch_id") ?? ""));
  if (!branchId) return;

  const name = String(formData.get("full_name") ?? "").trim();
  // تطبيع وتحقّق الرقم — نفس قاعدة العميل، وإلا تشظّى العميل الواحد من مسار الموظّف
  const phone = saudiMobile(String(formData.get("phone") ?? ""));
  const when = String(formData.get("reserved_at") ?? "").trim();
  if (!phone || !when) return;
  const party = Math.max(1, Number(String(formData.get("party_size") ?? "2")) || 2);
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  await caller.supabase.rpc("create_reservation_guest", {
    p_branch_id: branchId,
    p_full_name: name,
    p_phone: phone,
    p_reserved_at: new Date(when).toISOString(),
    p_party_size: party,
    p_notes: notes,
  });
  revalidatePath("/dashboard/reservations");
}

export async function setReservationStatus(id: string, status: ResStatus) {
  if (!id || !STATUSES.includes(status)) return;
  const caller = await requirePerm("reservations");
  if (!caller) return;
  const branchIds = await callerBranchIds(caller);
  if (branchIds.length === 0) return;
  await caller.supabase
    .from("reservations")
    .update({ status })
    .eq("id", id)
    .in("branch_id", branchIds);
  revalidatePath("/dashboard/reservations");
}
