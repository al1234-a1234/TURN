"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";

// حفظ إعدادات هدية الترحيب لـ«امسح خذ هديتك»
export async function saveCheckinSettings(formData: FormData) {
  const caller = await requirePerm("loyalty");
  if (!caller) return;

  const welcome_enabled = formData.get("welcome_enabled") === "on";
  const welcome_kind = String(formData.get("welcome_kind") ?? "discount") === "gift" ? "gift" : "discount";
  const welcome_title = String(formData.get("welcome_title") ?? "").trim() || "هدية ترحيب";
  const welcome_value_kind = String(formData.get("welcome_value_kind") ?? "percent") === "amount" ? "amount" : "percent";
  const valueRaw = String(formData.get("welcome_value") ?? "").trim();
  const welcome_value = valueRaw ? Math.max(0, Number(valueRaw)) : null;
  const daysRaw = String(formData.get("welcome_expires_days") ?? "").trim();
  const welcome_expires_days = Math.min(365, Math.max(1, daysRaw ? Number(daysRaw) : 14));

  await caller.supabase.from("checkin_settings").upsert({
    restaurant_id: caller.restaurantId,
    welcome_enabled,
    welcome_kind,
    welcome_title,
    welcome_value: welcome_kind === "discount" && Number.isFinite(welcome_value as number) ? welcome_value : null,
    welcome_value_kind,
    welcome_expires_days,
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/dashboard/checkin");
}
