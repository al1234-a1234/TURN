"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";

export async function toggleReviewPublish(id: string, next: boolean) {
  const caller = await requirePerm("reviews");
  if (!caller) return;
  // RLS يفرض الصلاحية والفرع؛ نضيّق هنا أيضًا دفاعًا في العمق.
  // المربوط بفرع لا ينشر/يخفي حتى تقييمات قديمة بلا فرع (تخصّ العلامة).
  const q = caller.supabase.from("reviews").update({ is_published: next }).eq("id", id);
  // غير المربوط يدير تقييمات مطعمه كلها (ومنها القديمة بلا فرع) — RLS يحدّ فروعه
  await (caller.branchId ? q.eq("branch_id", caller.branchId) : q.eq("restaurant_id", caller.restaurantId));
  revalidatePath("/dashboard/reviews");
}
