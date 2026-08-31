"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { resolveCaller } from "../guard";

/**
 * إرجاع عميلٍ أُزيل — من داخل سجلّ اليوم نفسه.
 *
 * ── الصلاحية مفروضةٌ في القاعدة لا هنا ──
 * `restore_queue_entry` دالّة SECURITY DEFINER تفحص
 * `my_branch_ids_for('waitlist')` بنفسها وترفع 42501 لغير المخوَّل. فالفحص
 * هنا **دفاعٌ في العمق فقط**، لا الحارس الوحيد: نداءٌ مباشر عبر PostgREST
 * يتخطّى الواجهة كلّها، وهو بالضبط ما يجعل إخفاءَ الزرّ حمايةً وهميّة
 * (عطل ث-٢ في 0106).
 *
 * والمستوى صلاحيةُ الطابور العاديّة بقرار المالك: موظّف الاستقبال هو من
 * يقف على الباب لحظةَ الخطأ. وحصرُ الفرع باقٍ — لا يُرجع في فرعٍ ليس فرعه.
 *
 * ── ولا يُكتب `position` من هنا إطلاقًا ──
 * الدالّة تُدرج صفًّا بـposition = NULL فيتولّد رقمه من `set_waitlist_position`
 * لنفس (الفرع، القسم) ويحرسه قيد EXCLUDE. أيّ كتابةٍ خامّة للرقم من التطبيق
 * كانت ستخرق القيد أو تُنتج تكرارًا صامتًا.
 */
export async function restoreQueueEntry(entryId: string): Promise<
  { ok: true; newEntryId: string } | { ok: false; error: string }
> {
  const caller = await resolveCaller();
  if (!caller) return { ok: false, error: "غير مخوّل" };

  const { data, error } = await caller.supabase.rpc("restore_queue_entry", {
    p_entry_id: entryId,
  });

  if (error) {
    // رسائل بلغة الموظّف لا بلغة القاعدة — هو واقفٌ على الباب لا يقرأ رموزًا.
    const byCode: Record<string, string> = {
      "42501": "ما عندك صلاحية الطابور في هذا الفرع.",
      P0404: "لم أجد هذه الحركة — حدّث الصفحة.",
      P0412: "هذا العميل ما زال في الطابور.",
      P0413: "انتهت مهلة الإرجاع (١٥ دقيقة) — أضِفه من «إضافة عميل».",
    };
    return { ok: false, error: byCode[error.code ?? ""] ?? "تعذّر الإرجاع — حاول مجددًا." };
  }
  if (!data) return { ok: false, error: "تعذّر الإرجاع — حاول مجددًا." };

  revalidatePath("/dashboard/reception");
  revalidateTag("discovery");
  revalidatePath("/r/[slug]", "page");
  return { ok: true, newEntryId: data as string };
}
