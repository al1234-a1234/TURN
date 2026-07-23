"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";

const LINK_KEYS = ["maps", "instagram", "x", "tiktok", "snapchat", "whatsapp", "website"] as const;

export async function saveLinks(formData: FormData) {
  const caller = await requirePerm("settings");
  if (!caller) return;

  const links: Record<string, string> = {};
  for (const key of LINK_KEYS) {
    const value = String(formData.get(key) ?? "").trim();
    if (value) links[key] = value;
  }

  // RLS "owner updates own restaurant" يسمح للمالك بالتحديث
  const update: TablesUpdate<"restaurants"> = { links: links as Json };
  await caller.supabase.from("restaurants").update(update).eq("id", caller.restaurantId);
  revalidatePath("/dashboard/content");
}
