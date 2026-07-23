"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ResStatus = Database["public"]["Enums"]["reservation_status"];
const STATUSES: ResStatus[] = ["pending", "confirmed", "seated", "completed", "cancelled", "no_show"];

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

export async function createReservation(formData: FormData) {
  const { supabase, branchId } = await firstBranch();
  if (!branchId) return;
  const name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const when = String(formData.get("reserved_at") ?? "").trim();
  if (!phone || !when) return;
  const party = Math.max(1, Number(String(formData.get("party_size") ?? "2")) || 2);
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  await supabase.rpc("create_reservation_guest", {
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
  const supabase = await createClient();
  // RLS: "staff manages branch reservations"
  await supabase.from("reservations").update({ status }).eq("id", id);
  revalidatePath("/dashboard/reservations");
}
