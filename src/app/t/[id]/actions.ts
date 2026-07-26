"use server";

import { createClient } from "@/lib/supabase/server";

/** تأكيد حضور صاحب الدور (رابط واتساب). لا يكشف شيئًا ولا يضرّ إن تكرّر. */
export async function confirmAttendance(entryId: string): Promise<boolean> {
  if (!entryId) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_attendance", { p_entry_id: entryId });
  return !error && data === true;
}
