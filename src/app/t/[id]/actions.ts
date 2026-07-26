"use server";

import { createClient } from "@/lib/supabase/server";
import { pushRankUpdatesAfterTicketCancel } from "@/lib/push";

/** تأكيد حضور صاحب الدور (رابط واتساب). لا يكشف شيئًا ولا يضرّ إن تكرّر. */
export async function confirmAttendance(entryId: string): Promise<boolean> {
  if (!entryId) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_attendance", { p_entry_id: entryId });
  return !error && data === true;
}

/** إلغاء الدور من رابط التذكرة — بضغطة، بلا كتابة في واتساب. */
export async function cancelByTicket(entryId: string): Promise<boolean> {
  if (!entryId) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_by_ticket", { p_entry_id: entryId });
  const ok = !error && data === true;

  // من خلفه تقدّم دوره — أشعِرهم
  if (ok) await pushRankUpdatesAfterTicketCancel(supabase, entryId);

  return ok;
}
