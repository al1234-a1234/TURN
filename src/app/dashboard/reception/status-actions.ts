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

/**
 * «إيقاف الانضمام مؤقّتًا» — الحالة الثالثة، منفصلةٌ تمامًا عن الاثنتين فوق.
 *
 * وُلدت من تشغيل Pizza peel الأوّل: امتلأ الطابور، ولم يكن ثمّ زرٌّ يوقف
 * الجديد وحده. queue_paused يقول للعميل «تفضّل مباشرة» (كارثيّ و٣٧ ينتظرون)،
 * والسقف العدديّ يعيد الفتح تلقائيًّا فور نزول العدد (فكلّ تجليسٍ يفتح البابَ
 * لجديد). فاضطرّ الفريق لإيقاف التجليس ساعتين.
 *
 * الإيقاف هنا يمنع كلّ جديدٍ فورًا بصرف النظر عن العدد، ولا يُلغى تلقائيًّا،
 * ويعرض للعميل نفس رسالة السقف «الطابور ممتلئ حاليًا». من في الطابور لا
 * يتأثّر: يبقى، يُخدم، يستعيد تذكرته. وصلاحيته `waitlist` كأخواته — قرارٌ
 * تشغيليّ لحظيّ على الباب.
 */
export type JoinFrozenReason = "done_today" | "temporary";

export async function setBranchJoinFrozen(
  branchId: string,
  frozen: boolean,
  reason?: JoinFrozenReason,
): Promise<boolean> {
  const caller = await requirePerm("waitlist");
  if (!caller) return false;
  // السبب يغيّر ما يقرؤه الضيف لا أكثر: «اكتملت حجوزات اليوم» تعني لا تنتظر
  // وتعال غدًا، و«المطعم مزدحمٌ حاليًا» تعني انتظر لحظات. والقاعدة تُسقط أيّ
  // قيمةٍ غير معروفة إلى NULL فتصير الرسالة الثانية — الآمنة في الحالتين.
  const { data, error } = await caller.supabase.rpc("set_branch_join_frozen", {
    p_branch_id: branchId,
    p_frozen: frozen,
    p_reason: frozen ? (reason ?? null) : null,
  });
  // `false` = «لا حقّ لك على هذا الفرع» — لا تُبتلع كي لا تكذب الواجهة.
  if (error || data !== true) return false;
  revalidatePath("/dashboard/reception");
  revalidateTag("discovery");
  revalidatePath("/r/[slug]", "page");
  return true;
}