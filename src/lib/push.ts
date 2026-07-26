import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * إرسال إشعارات الدفع (Web Push) للعميل — يصل والتطبيق مُغلق.
 *
 * المفتاح العام يُحقن وقت البناء (NEXT_PUBLIC_VAPID_PUBLIC_KEY) والخاص سرّ
 * على الخادم (VAPID_PRIVATE_KEY). إن غاب أيّهما تتحوّل الدالة إلى «لا شيء»
 * بهدوء — فلا يتعطّل الطابور أبدًا بسبب الإشعارات.
 */
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:albraalaan@gmail.com";

export const pushConfigured = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (pushConfigured) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
};

/**
 * يرسل إشعارًا لكل أجهزة عميل صفِّ الطابور المحدَّد.
 * الاشتراكات المنتهية (404/410) تُحذف تلقائيًّا.
 * لا يرمي أبدًا: أي فشل يُبتلع كي لا يفشل إجراء الاستقبال.
 */
export async function pushToWaitlistEntry(
  supabase: SupabaseClient<Database>,
  entryId: string,
  payload: PushPayload,
): Promise<number> {
  if (!pushConfigured) return 0;

  try {
    const { data: subs, error } = await supabase.rpc("push_subs_for_entry", {
      p_entry_id: entryId,
    });
    if (error || !subs?.length) return 0;

    const body = JSON.stringify(payload);
    let sent = 0;

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
          sent += 1;
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode;
          // 404/410 = اشتراك ميّت (أُلغي التصريح أو حُذف التطبيق) → نظّفه
          if (code === 404 || code === 410) {
            await supabase.rpc("delete_push_subscription", { p_endpoint: s.endpoint });
          }
        }
      }),
    );

    return sent;
  } catch {
    return 0;
  }
}
