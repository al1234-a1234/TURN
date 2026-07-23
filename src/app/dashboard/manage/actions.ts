"use server";

import { revalidatePath } from "next/cache";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { requirePerm } from "../guard";

export async function updateRestaurantInfo(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { supabase, restaurantId: rid } = caller;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const logo_url = String(formData.get("logo_url") ?? "").trim() || null;
  const cover_url = String(formData.get("cover_url") ?? "").trim() || null;
  const cuisine = String(formData.get("cuisine") ?? "").trim() || null;
  const cuisine_en = String(formData.get("cuisine_en") ?? "").trim() || null;
  const patch: TablesUpdate<"restaurants"> = { logo_url, cover_url, description, cuisine, cuisine_en };
  if (name) patch.name = name;
  await supabase.from("restaurants").update(patch).eq("id", rid);
  revalidatePath("/dashboard/manage");
}

export async function updateBranchSettings(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { supabase, restaurantId: rid } = caller;

  const acceptsWaitlist = formData.get("accepts_waitlist") === "on";
  const acceptsReservations = formData.get("accepts_reservations") === "on";
  const maxPartyRaw = String(formData.get("max_party_size") ?? "").trim();
  const maxParty = maxPartyRaw ? Math.max(1, Number(maxPartyRaw)) : 20;
  const open = String(formData.get("open_time") ?? "").trim() || null;
  const close = String(formData.get("close_time") ?? "").trim() || null;

  // نحدّث الفرع المعروض في النموذج فقط (لا نطمس بقية الفروع).
  // إن غاب branch_id لأي سبب نعود للفرع الأقدم لهذا المطعم.
  let branchId = String(formData.get("branch_id") ?? "").trim();
  if (branchId) {
    const { data: owned } = await supabase
      .from("branches").select("id").eq("id", branchId).eq("restaurant_id", rid).maybeSingle();
    if (!owned) branchId = "";
  }
  if (!branchId) {
    const { data: b0 } = await supabase
      .from("branches").select("id").eq("restaurant_id", rid).order("created_at").limit(1).maybeSingle();
    branchId = b0?.id ?? "";
  }
  if (!branchId) return;

  await supabase
    .from("branch_settings")
    .update({
      accepts_waitlist: acceptsWaitlist,
      accepts_reservations: acceptsReservations,
      max_party_size: Number.isFinite(maxParty) ? maxParty : 20,
      opening_hours: { open, close },
    })
    .eq("branch_id", branchId);

  revalidatePath("/dashboard/manage");
  revalidatePath("/dashboard");
}

// ---------- الفروع والمواقع ----------
export async function addBranch(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { supabase, restaurantId: rid } = caller;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const city = String(formData.get("city") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  await supabase.from("branches").insert({ restaurant_id: rid, name, city, address });
  revalidatePath("/dashboard/manage");
  revalidatePath("/dashboard");
}

export async function deleteBranch(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { supabase, restaurantId: rid } = caller;
  const id = String(formData.get("branch_id") ?? "");
  if (!id) return;
  // لا تحذف آخر فرع
  const { count } = await supabase
    .from("branches")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", rid);
  if ((count ?? 0) <= 1) return;
  await supabase.from("branches").delete().eq("id", id).eq("restaurant_id", rid);
  revalidatePath("/dashboard/manage");
  revalidatePath("/dashboard");
}

export async function toggleMenuItem(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const id = String(formData.get("item_id") ?? "");
  const available = formData.get("available") === "true";
  if (!id) return;
  await caller.supabase
    .from("menu_items").update({ is_available: available })
    .eq("id", id).eq("restaurant_id", caller.restaurantId);
  revalidatePath("/dashboard/manage");
}

export async function addMenuCategory(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await caller.supabase.from("menu_categories").insert({ restaurant_id: caller.restaurantId, name });
  revalidatePath("/dashboard/manage");
}

export async function deleteMenuCategory(id: string) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  await caller.supabase
    .from("menu_categories").delete()
    .eq("id", id).eq("restaurant_id", caller.restaurantId);
  revalidatePath("/dashboard/manage");
}

export async function addMenuItem(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  const { supabase, restaurantId: rid } = caller;
  const categoryId = String(formData.get("category_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!categoryId || !name) return;
  const priceRaw = String(formData.get("price") ?? "").trim();
  const price = priceRaw ? Number(priceRaw) : null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const image_url = String(formData.get("image_url") ?? "").trim() || null;
  await supabase.from("menu_items").insert({
    restaurant_id: rid,
    category_id: categoryId,
    name,
    price: Number.isFinite(price as number) ? price : null,
    description,
    image_url,
  });
  revalidatePath("/dashboard/manage");
}

export async function deleteMenuItem(id: string) {
  const caller = await requirePerm("settings");
  if (!caller) return;
  await caller.supabase
    .from("menu_items").delete()
    .eq("id", id).eq("restaurant_id", caller.restaurantId);
  revalidatePath("/dashboard/manage");
}
