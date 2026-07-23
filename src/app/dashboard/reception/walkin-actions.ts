"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** إضافة عميل حاضر (walk-in) للطابور من الاستقبال. */
export async function addWalkIn(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: staff } = await supabase
    .from("staff").select("restaurant_id").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!staff) return;
  const { data: branch } = await supabase
    .from("branches").select("id").eq("restaurant_id", staff.restaurant_id).order("created_at").limit(1).maybeSingle();
  if (!branch) return;

  const name = String(formData.get("full_name") ?? "").trim() || "ضيف";
  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone) return;
  const party = Math.max(1, Number(String(formData.get("party_size") ?? "2")) || 2);
  const zone = String(formData.get("zone") ?? "inside") === "outside" ? "outside" : "inside";

  await supabase.rpc("join_waitlist_guest", {
    p_branch_id: branch.id,
    p_full_name: name,
    p_phone: phone,
    p_party_size: party,
    p_zone: zone,
  });
  revalidatePath("/dashboard/reception");
}
