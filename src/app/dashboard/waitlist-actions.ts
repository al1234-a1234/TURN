"use server";

import { revalidatePath } from "next/cache";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { requirePerm, callerBranchIds } from "./guard";
import { pushToWaitlistEntry } from "@/lib/push";

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

  const { error } = await caller.supabase
    .from("waitlist_entries")
    .update(patch)
    .eq("id", id)
    .in("branch_id", branchIds);

  // إشعار الدفع للعميل — يصل والتطبيق مُغلق. لا يفشل الإجراء إن تعذّر الإرسال.
  if (!error && (action === "notified" || action === "seated")) {
    const { data: rest } = await caller.supabase
      .from("restaurants")
      .select("name, slug")
      .eq("id", caller.restaurantId)
      .maybeSingle();
    const venue = rest?.name ?? "المطعم";
    const url = rest?.slug ? `/r/${rest.slug}` : "/";

    await pushToWaitlistEntry(
      caller.supabase,
      id,
      action === "seated"
        ? { title: "تفضّل، دورك جاهز 🎉", body: `توجّه إلى الاستقبال في ${venue}.`, url, tag: "turn-queue", requireInteraction: true }
        : { title: "دورك اقترب 🔔", body: `نبّهك ${venue} — استعدّ للحضور.`, url, tag: "turn-queue", requireInteraction: true },
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/reception");
}
