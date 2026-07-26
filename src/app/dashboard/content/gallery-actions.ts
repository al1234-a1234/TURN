"use server";

import { revalidatePath } from "next/cache";
import { requirePerm, resolveWriteBranch } from "../guard";

export async function addRestaurantPhoto(url: string, caption?: string, branchId?: string) {
  const caller = await requirePerm("settings");
  if (!caller || !url) return;
  const { count } = await caller.supabase
    .from("restaurant_photos").select("id", { count: "exact", head: true }).eq("restaurant_id", caller.restaurantId);
  const bId = await resolveWriteBranch(caller, branchId);
  if (!bId) return;
  await caller.supabase.from("restaurant_photos").insert({
    restaurant_id: caller.restaurantId,
    branch_id: bId,
    url,
    caption: caption?.trim() || null,
    sort_order: count ?? 0,
  });
  revalidatePath("/dashboard/content");
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
    .eq("restaurant_id", caller.restaurantId);
  revalidatePath("/dashboard/content");
}
