"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";

async function resolveRestaurant() {
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

const LINK_KEYS = ["maps", "instagram", "x", "tiktok", "snapchat", "whatsapp", "website"] as const;

export async function saveLinks(formData: FormData) {
  const { supabase, rid } = await resolveRestaurant();
  if (!rid) return;

  const links: Record<string, string> = {};
  for (const key of LINK_KEYS) {
    const value = String(formData.get(key) ?? "").trim();
    if (value) links[key] = value;
  }

  // RLS "owner updates own restaurant" يسمح للمالك بالتحديث
  const update: TablesUpdate<"restaurants"> = { links: links as Json };
  await supabase.from("restaurants").update(update).eq("id", rid);
  revalidatePath("/dashboard/content");
}
