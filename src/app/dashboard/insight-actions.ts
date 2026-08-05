"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "./guard";

/** إخفاء بصيرة مقروءة — كانت البطاقات تبقى للأبد بلا زر صرف. */
export async function dismissInsight(id: string) {
  if (!id) return;
  const caller = await requirePerm("analytics");
  if (!caller) return;
  const { error } = await caller.supabase
    .from("owner_insights")
    .update({ is_read: true })
    .eq("id", id)
    .eq("restaurant_id", caller.restaurantId);
  // بطاقة تختفي ثم تعود بعد أوّل تحديث تُربك أكثر من بقائها ظاهرة
  if (error) {
    console.error("[dismissInsight]", error.message);
    return;
  }
  revalidatePath("/dashboard");
}
