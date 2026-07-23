"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function resolveRestaurant() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, rid: null as string | null };
  const { data } = await supabase
    .from("staff").select("restaurant_id").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
  return { supabase, rid: data?.restaurant_id ?? null };
}

export async function addRestaurantPhoto(url: string, caption?: string) {
  const { supabase, rid } = await resolveRestaurant();
  if (!rid || !url) return;
  const { count } = await supabase
    .from("restaurant_photos").select("id", { count: "exact", head: true }).eq("restaurant_id", rid);
  await supabase.from("restaurant_photos").insert({
    restaurant_id: rid,
    url,
    caption: caption?.trim() || null,
    sort_order: count ?? 0,
  });
  revalidatePath("/dashboard/content");
}

export async function deleteRestaurantPhoto(formData: FormData) {
  const id = String(formData.get("photo_id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("restaurant_photos").delete().eq("id", id);
  revalidatePath("/dashboard/content");
}
