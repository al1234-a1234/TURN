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

export async function updateBranchSettings(formData: FormData) {
  const { supabase, rid } = await myRestaurantId();
  if (!rid) return;

  const acceptsWaitlist = formData.get("accepts_waitlist") === "on";
  const maxPartyRaw = String(formData.get("max_party_size") ?? "").trim();
  const maxParty = maxPartyRaw ? Math.max(1, Number(maxPartyRaw)) : 20;
  const open = String(formData.get("open_time") ?? "").trim() || null;
  const close = String(formData.get("close_time") ?? "").trim() || null;

  const { data: branches } = await supabase.from("branches").select("id").eq("restaurant_id", rid);
  const ids = (branches ?? []).map((b) => b.id);
  if (!ids.length) return;

  await supabase
    .from("branch_settings")
    .update({
      accepts_waitlist: acceptsWaitlist,
      max_party_size: Number.isFinite(maxParty) ? maxParty : 20,
      opening_hours: { open, close },
    })
    .in("branch_id", ids);

  revalidatePath("/dashboard/manage");
  revalidatePath("/dashboard");
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
