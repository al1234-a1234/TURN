"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";

/** إضافة عميل حاضر (walk-in) للطابور من الاستقبال. */
export async function addWalkIn(formData: FormData) {
  // إضافة للطابور = صلاحية «الطابور»
  const caller = await requirePerm("waitlist");
  if (!caller) return;
  const supabase = caller.supabase;

  // الفرع المختار في الاستقبال — لا بد أن يكون تابعًا لمطعم صاحب الصلاحية (منع الخلط بين الفروع/المطاعم)
  const submittedBranch = String(formData.get("branch_id") ?? "").trim();
  const branchQuery = supabase
    .from("branches").select("id").eq("restaurant_id", caller.restaurantId).eq("is_active", true);
  const { data: branch } = submittedBranch
    ? await branchQuery.eq("id", submittedBranch).maybeSingle()
    : await branchQuery.order("created_at").limit(1).maybeSingle();
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
