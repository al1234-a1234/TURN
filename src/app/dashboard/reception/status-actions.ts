"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requirePerm } from "../guard";

/** إغلاق/فتح الفرع يدويًّا أو تعليم "مزدحم الآن" — من الاستقبال مباشرة. */
export async function setBranchStatus(branchId: string, manuallyClosed: boolean, busyNow: boolean) {
  const caller = await requirePerm("waitlist");
  if (!caller) return;
  await caller.supabase.rpc("set_branch_status", {
    p_branch_id: branchId,
    p_manually_closed: manuallyClosed,
    p_busy_now: busyNow,
  });
  revalidatePath("/dashboard/reception");
  // الرئيسية وصفحة المطعم مكاشتان (30/10ث) — بلا هذا يبقى الفرع "متاحًا" للعميل
  // دقائق بعد إغلاقه فعليًّا من الاستقبال.
  revalidateTag("discovery");
  revalidatePath("/r/[slug]", "page");
}
