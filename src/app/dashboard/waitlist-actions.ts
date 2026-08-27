"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { requirePerm, callerBranchIds } from "./guard";
import { pushToWaitlistEntry, pushQueueRankUpdates } from "@/lib/push";

type Action = "seated" | "cancelled" | "notified";

export async function updateWaitlistStatus(id: string, action: Action): Promise<boolean> {
  // صلاحية «الطابور» مطلوبة (RLS يفرض العزل بين المطاعم، ونضيف الصلاحية الدقيقة هنا)
  const caller = await requirePerm("waitlist");
  if (!caller) return false;

  const patch: TablesUpdate<"waitlist_entries"> = { status: action };
  if (action === "seated") patch.seated_at = new Date().toISOString();
  if (action === "notified") patch.notified_at = new Date().toISOString();

  // تضييق التحديث على فروع مطعم المتصل فقط (دفاع في العمق فوق RLS). كان
  // هذا وقراءة «قبل» لأجل الإشعار المؤجَّل يمشيان تباعًا — رحلةٌ كاملة إلى
  // فرانكفورت ورجعتها زيادةً على كل ضغطة. القراءة لا يحتاجها المسار
  // المتزامن أصلًا (الإشعار مؤجَّلٌ بعد الردّ)، فحُذفت من هنا، لا أُجّلت فقط.
  const branchIds = await callerBranchIds(caller);
  if (branchIds.length === 0) return false;

  // حارس الحالة: صفحة الاستقبال قد تتأخر عن الواقع — لو ألغى الضيف دوره من
  // تذكرته، ضغطةُ «إجلاس» متأخرة كانت تحييه وتحسب زيارة لمن غادر.
  const allowedFrom: ("waiting" | "notified" | "seated")[] = action === "cancelled"
    ? ["waiting", "notified", "seated"]
    : ["waiting", "notified"];
  const { data: updated, error } = await caller.supabase
    .from("waitlist_entries")
    .update(patch)
    .eq("id", id)
    .in("branch_id", branchIds)
    .in("status", allowedFrom)
    .select("id, branch_id, zone");
  // صفر صفوف = الحالة تغيّرت تحتنا (ألغى الضيف/جُلس من جهاز آخر) — نُعلم
  // الواجهة بدل صمتٍ يدفع المضيف يضغط مرارًا ظانًّا الشبكة بطيئة
  const row = updated?.[0];
  const changed = !error && Boolean(row);

  // إشعارات الدفع — فقط إن تغيّر صف فعلًا، وتُرسل بعد ردّ الاستجابة (after) كي لا يعلّق زر الإجلاس:
  // إجلاس في طابور ٥٠ شخصًا = ٥٠ استدعاء HTTPS، ولا يصح أن ينتظرها الموظّف.
  // الفرع والقسم اللذان كانا يُقرآن قبل التحديث نأخذهما الآن من نتيجة
  // التحديث نفسها (select يعيدهما) — بلا استدعاءٍ إضافي مطلقًا.
  if (changed && row) after(async () => {
    const { data: rest } = await caller.supabase
      .from("restaurants")
      .select("name, slug")
      .eq("id", caller.restaurantId)
      .maybeSingle();
    const venue = rest?.name ?? "المطعم";
    const url = rest?.slug ? `/r/${rest.slug}` : "/";

    // 1) صاحب الصف نفسه: نُبّه أو جلس
    if (action === "notified" || action === "seated") {
      await pushToWaitlistEntry(
        caller.supabase,
        id,
        action === "seated"
          ? { title: "تفضّل، دورك جاهز 🎉", body: `توجّه إلى الاستقبال في ${venue}.`, url, tag: "turn-queue", requireInteraction: true }
          : { title: "دورك اقترب 🔔", body: `نبّهك ${venue} — استعدّ للحضور.`, url, tag: "turn-queue", requireInteraction: true },
      );
    }

    // 2) تلقائيًّا: كل من تقدّم دوره بخروج هذا الصف من الطابور
    if (action === "seated" || action === "cancelled") {
      await pushQueueRankUpdates(caller.supabase, row.branch_id, row.zone ?? null, venue, url);
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/reception");
  // كانت مفقودة هنا كليًّا: مسار الضيف نفسه يُبطل وسم الرئيسية عند إلغائه
  // الذاتي، لكن جلوس/إزالة الموظّف — الأكثر وقوعًا فعليًّا — لا يمسّه.
  // فالعميل يلغي دوره على شاشة الاستقبال ولا شيء يخبر شاشة العميل ولا
  // الرئيسية؛ تبقيان على الرقم القديم حتى تقادم الكاش الطبيعي — بالضبط
  // ما رآه المشغّل: «الاستقبال سريع، لكن العكسي بطيء». وقبل الردّ لا بعده،
  // لنفس درس اليوم: after() لا يضمن تنفيذ الإبطال بعد انتهاء الطلب.
  if (changed && (action === "seated" || action === "cancelled")) {
    try { revalidateTag("queue-counts"); revalidatePath("/"); } catch { /* التقادم العشري يصحّحها */ }
  }
  return changed;
}
