"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { requirePerm, callerBranchIds } from "./guard";
import { pushToWaitlistEntry, pushQueueRankUpdates } from "@/lib/push";

type Action = "seated" | "cancelled" | "notified";

export async function updateWaitlistStatus(id: string, action: Action) {
  // صلاحية «الطابور» مطلوبة (RLS يفرض العزل بين المطاعم، ونضيف الصلاحية الدقيقة هنا)
  const caller = await requirePerm("waitlist");
  if (!caller) return;

  const patch: TablesUpdate<"waitlist_entries"> = { status: action };
  if (action === "seated") patch.seated_at = new Date().toISOString();
  if (action === "notified") patch.notified_at = new Date().toISOString();

  // تضييق التحديث على فروع مطعم المتصل فقط (دفاع في العمق فوق RLS)
  const branchIds = await callerBranchIds(caller);
  if (branchIds.length === 0) return;

  // نلتقط الفرع والقسم قبل التحديث — نحتاجهما لإشعار من تقدّم دوره
  const { data: before } = await caller.supabase
    .from("waitlist_entries")
    .select("branch_id, zone")
    .eq("id", id)
    .in("branch_id", branchIds)
    .maybeSingle();

  // حارس الحالة: صفحة الاستقبال قد تتأخر ١٠ ثوانٍ عن الواقع — لو ألغى الضيف
  // دوره من تذكرته، ضغطةُ «إجلاس» متأخرة كانت تحييه وتحسب زيارة لمن غادر.
  const allowedFrom: ("waiting" | "notified" | "seated")[] = action === "cancelled"
    ? ["waiting", "notified", "seated"]
    : ["waiting", "notified"];
  const { error } = await caller.supabase
    .from("waitlist_entries")
    .update(patch)
    .eq("id", id)
    .in("branch_id", branchIds)
    .in("status", allowedFrom);

  // إشعارات الدفع — تُرسل بعد ردّ الاستجابة (after) كي لا يعلّق زر الإجلاس:
  // إجلاس في طابور ٥٠ شخصًا = ٥٠ استدعاء HTTPS، ولا يصح أن ينتظرها الموظّف.
  if (!error) after(async () => {
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
    if ((action === "seated" || action === "cancelled") && before?.branch_id) {
      await pushQueueRankUpdates(caller.supabase, before.branch_id, before.zone ?? null, venue, url);
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/reception");
}
