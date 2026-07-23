"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleReviewPublish(id: string, next: boolean) {
  const supabase = await createClient();
  // RLS يفرض staff_has_perm(restaurant_id,'reviews')
  await supabase.from("reviews").update({ is_published: next }).eq("id", id);
  revalidatePath("/dashboard/reviews");
}
