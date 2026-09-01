"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";

/**
 * تبديل موضعَي دورين في الطابور — لا إعادة ترتيب.
 *
 * الحالة من الميدان: صاحب الدور ٣ يُنادى فيقول «أمهلوني»، فيبدّله الاستقبال
 * مع صاحب الدور ٦. لا يُمسّ أحدٌ غيرهما، ولا يُشعَر أحد.
 *
 * كلّ الفحص في القاعدة لا هنا: الفرع، والقسم، والحالة الحيّة، والصلاحية
 * عبر my_branch_ids_for. وهذه الطبقة دفاعٌ في العمق (requirePerm) لا بديل —
 * نداءٌ مباشر عبر PostgREST يتخطّى الواجهة، فالحارس الحقيقيّ في الدالّة.
 *
 * والرسالة تعود كما صاغتها القاعدة بالعربيّة، فلا تُترجَم هنا مرّتين.
 */
export async function swapQueuePositions(
  aId: string,
  bId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const caller = await requirePerm("waitlist");
  if (!caller) return { ok: false, message: "غير مخوّل" };

  // الدالّة أحدث من ملفّ الأنواع المولَّد — تحديدٌ صريحٌ بدل تعطيل الفحص
  const { error } = await (
    caller.supabase as unknown as {
      rpc: (
        fn: "swap_queue_positions",
        args: { p_a: string; p_b: string },
      ) => Promise<{ error: { message: string } | null }>;
    }
  ).rpc("swap_queue_positions", { p_a: aId, p_b: bId });

  if (error) return { ok: false, message: error.message || "تعذّر التبديل" };

  // شاشة الاستقبال تلتقط التغيير أصلًا عبر اشتراك realtime على
  // waitlist_entries (auto-refresh.tsx) — وهذا لتبويب من نفّذ الفعل، بلا
  // استطلاعٍ جديد.
  revalidatePath("/dashboard/reception");
  return { ok: true };
}
