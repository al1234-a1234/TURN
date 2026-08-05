"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requirePerm } from "../guard";

export async function toggleReviewPublish(id: string, next: boolean) {
  const caller = await requirePerm("reviews");
  if (!caller) return;
  // RLS يفرض الصلاحية والفرع؛ نضيّق هنا أيضًا دفاعًا في العمق.
  // «المالك مالك» (0062): دور owner يدير تقييمات مطعمه كلها بكل فروعها؛
  // غير المالك المربوط بفرع يبقى محصورًا في فرعه.
  const q = caller.supabase.from("reviews").update({ is_published: next }).eq("id", id);
  const brandWide = caller.role === "owner" || !caller.branchId;
  const { error } = await (brandWide ? q.eq("restaurant_id", caller.restaurantId) : q.eq("branch_id", caller.branchId!));
  // تقييم يظنّه المالك مخفيًّا وهو منشور للعميل — لا نبثّ حالةً لم تُكتب
  if (error) {
    console.error("[toggleReviewPublish]", error.message);
    return;
  }
  revalidatePath("/dashboard/reviews");
  revalidateTag("discovery");
}
