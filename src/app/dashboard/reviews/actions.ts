"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";

export async function toggleReviewPublish(id: string, next: boolean) {
  const caller = await requirePerm("reviews");
  if (!caller) return;
  // RLS يفرض staff_has_perm(restaurant_id,'reviews')؛ نضيف فحص الصلاحية والتضييق دفاعًا في العمق
  await caller.supabase
    .from("reviews")
    .update({ is_published: next })
    .eq("id", id)
    .eq("restaurant_id", caller.restaurantId);
  revalidatePath("/dashboard/reviews");
}
