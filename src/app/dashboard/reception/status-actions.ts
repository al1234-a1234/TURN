"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requirePerm } from "../guard";

/** إغلاق/فتح الفرع يدويًّا أو تعليم "مزدحم الآن" — من الاستقبال مباشرة. */
export async function setBranchStatus(branchId: string, manuallyClosed: boolean, busyNow: boolean): Promise<boolean> {
  const caller = await requirePerm("waitlist");
  if (!caller) return false;
  const { data, error } = await caller.supabase.rpc("set_branch_status", {
    p_branch_id: branchId,
    p_manually_closed: manuallyClosed,
    p_busy_now: busyNow,
  });
  // الدالة ترجع false لمن لا يملك حقّ الفرع — تجاهلها كان يترك الواجهة
  // «مغلق» والفرع مفتوحًا فعليًّا في القاعدة
  if (error || data !== true) return false;
  revalidatePath("/dashboard/reception");
  // الرئيسية وصفحة المطعم مكاشتان (30/10ث) — بلا هذا يبقى الفرع "متاحًا" للعميل
  // دقائق بعد إغلاقه فعليًّا من الاستقبال.
  revalidateTag("discovery");
  revalidatePath("/r/[slug]", "page");
  return true;
}