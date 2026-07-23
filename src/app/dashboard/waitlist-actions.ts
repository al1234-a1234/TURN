"use server";

import { revalidatePath } from "next/cache";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { requirePerm, callerBranchIds } from "./guard";

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

  await caller.supabase
    .from("waitlist_entries")
    .update(patch)
    .eq("id", id)
    .in("branch_id", branchIds);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/reception");
}
