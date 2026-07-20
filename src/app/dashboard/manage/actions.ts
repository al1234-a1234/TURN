"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function myRestaurantId() {
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

export async function updateRestaurantInfo(formData: FormData) {
  const { supabase, rid } = await myRestaurantId();
  if (!rid) return;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const logo_url = String(formData.get("logo_url") ?? "").trim() || null;
  const cover_url = String(formData.get("cover_url") ?? "").trim() || null;
  const patch: Record<string, unknown> = { logo_url, cover_url, description };
  if (name) patch.name = name;
  await supabase.from("restaurants").update(patch).eq("id", rid);
  revalidatePath("/dashboard/manage");
}

export async function addMenuCategory(formData: FormData) {
  const { supabase, rid } = await myRestaurantId();
  if (!rid) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase.from("menu_categories").insert({ restaurant_id: rid, name });
  revalidatePath("/dashboard/manage");
}

export async function deleteMenuCategory(id: string) {
  const { supabase } = await myRestaurantId();
  await supabase.from("menu_categories").delete().eq("id", id);
  revalidatePath("/dashboard/manage");
}

export async function addMenuItem(formData: FormData) {
  const { supabase, rid } = await myRestaurantId();
  if (!rid) return;
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
  const { supabase } = await myRestaurantId();
  await supabase.from("menu_items").delete().eq("id", id);
  revalidatePath("/dashboard/manage");
}
