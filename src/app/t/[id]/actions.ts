"use server";

import { after } from "next/server";
import { guestWriter } from "@/lib/supabase/guest-writes";
import { pushRankUpdatesAfterTicketCancel } from "@/lib/push";
import { checkBotId } from "botid/server";

/** تأكيد حضور صاحب الدور (رابط واتساب). لا يكشف شيئًا ولا يضرّ إن تكرّر. */
export async function confirmAttendance(entryId: string): Promise<boolean> {
  if (!entryId) return false;
  const bot = await checkBotId({ advancedOptions: { checkLevel: "deepAnalysis" } });
  if (bot.isBot) return false;
  const supabase = await guestWriter();
  const { data, error } = await supabase.rpc("confirm_attendance", { p_entry_id: entryId });
  return !error && data === true;
}

/**
 * إلغاء الدور من رابط التذكرة — بضغطة، بلا كتابة في واتساب.
 *
 * الرابط UUID عشوائي غير قابل للتخمين، لكنه لا يبقى سرًا أبدًا: يُمرّر
 * كنصٍّ صريح في رسالة واتساب (قد تُعاد توجيهها) وقد يظهر في سجلّات
 * وسيطة. من يحصل عليه بأي طريقة كان يستطيع إلغاء دور غيره بلا أي تحقّق.
 * الآن يُطابَق رقم الجوّال في القاعدة (cancel_by_ticket) قبل الإلغاء —
 * نفس نمط cancelWaitlistGuest.
 */
export async function cancelByTicket(entryId: string, phone: string): Promise<boolean> {
  if (!entryId || !phone) return false;
  const supabase = await guestWriter();
  const { data, error } = await supabase.rpc("cancel_by_ticket", {
    p_entry_id: entryId,
    p_phone: phone,
  });
  const ok = !error && data === true;

  // من خلفه تقدّم دوره — أشعِرهم بعد ردّ الاستجابة
  if (ok) after(async () => { await pushRankUpdatesAfterTicketCancel(supabase, entryId); });

  return ok;
}
