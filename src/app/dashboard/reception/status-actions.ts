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

/**
 * «مفتوح بلا طابور» — الفرع يعمل ويُزار ويقبل الحجز، ولا يقبل دورًا جديدًا.
 *
 * غير الإقفال: المقفل يختفي خلف «مغلق»، وهذا يبقى معروضًا طبيعيًّا. يُستعمل
 * حين يكون المطعم فاضيًا فلا معنى لأن يأخذ الداخلُ دورًا رقمه ١.
 *
 * وصلاحيته `waitlist` لا `settings` — قرارٌ تشغيليّ لحظيّ يتّخذه المضيف على
 * الباب، كالإقفال تمامًا، لا إعدادٌ يضبطه المالك مرّةً في الشهر.
 */
export async function setBranchQueuePaused(branchId: string, paused: boolean): Promise<boolean> {
  const caller = await requirePerm("waitlist");
  if (!caller) return false;
  const { data, error } = await caller.supabase.rpc("set_branch_queue_paused", {
    p_branch_id: branchId,
    p_paused: paused,
  });
  // كالحالة أعلاه: `false` تعني «لا حقّ لك على هذا الفرع» — لا تُبتلع، وإلا
  // بقيت الواجهة تقول «موقوف» والقاعدة تقبل الأدوار.
  if (error || data !== true) return false;
  revalidatePath("/dashboard/reception");
  revalidateTag("discovery");
  revalidatePath("/r/[slug]", "page");
  return true;
}