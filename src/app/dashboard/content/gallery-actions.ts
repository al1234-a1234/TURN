"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requirePerm, resolveWriteBranch, callerBranchIds } from "../guard";

export async function addRestaurantPhoto(url: string, caption?: string, branchId?: string) {
  const caller = await requirePerm("settings");
  if (!caller || !url) return;
  const bId = await resolveWriteBranch(caller, branchId);
  if (!bId) return;
  // الترتيب يُحسب داخل الفرع نفسه — وإلا بدأ ترتيب صور الفرع الثاني من عدد صور الأول
  const { count } = await caller.supabase
    .from("restaurant_photos").select("id", { count: "exact", head: true }).eq("branch_id", bId);
  await caller.supabase.from("restaurant_photos").insert({
    restaurant_id: caller.restaurantId,
    branch_id: bId,
    url,
    caption: caption?.trim() || null,
    sort_order: count ?? 0,
  });
  revalidatePath("/dashboard/content");
  revalidateTag("discovery");
}

export async function deleteRestaurantPhoto(formData: FormData) {
  const id = String(formData.get("photo_id") ?? "");
  if (!id) return;
  const caller = await requirePerm("settings");
  if (!caller) return;
  await caller.supabase
    .from("restaurant_photos")
    .delete()
    .eq("id", id)
    .in("branch_id", await callerBranchIds(caller));
  revalidatePath("/dashboard/content");
  revalidateTag("discovery");
}
