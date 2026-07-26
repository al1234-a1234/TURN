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

/** تشخيص: يظهر في سجلّات Vercel بدل الفشل الصامت عند نقص المفاتيح. */
function warnUnconfigured(where: string) {
  console.warn(
    `[push] skipped (${where}): missing ${!PUBLIC_KEY ? "NEXT_PUBLIC_VAPID_PUBLIC_KEY" : ""}${!PUBLIC_KEY && !PRIVATE_KEY ? " and " : ""}${!PRIVATE_KEY ? "VAPID_PRIVATE_KEY" : ""}. Set it in Vercel and REDEPLOY.`,
  );
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
  /** تحديث صامت: يستبدل الإشعار بلا تنبيه صوتي/اهتزاز (لمن دوره بعيد). */
  silent?: boolean;
};

/** إرسال دفعة واحدة لاشتراك، مع تنظيف الاشتراك الميّت. يعيد true إن نجح. */
async function sendOne(
  supabase: SupabaseClient<Database>,
  sub: { endpoint: string; p256dh: string; auth: string },
  body: string,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      body,
    );
    return true;
  } catch (err) {
    const code = (err as { statusCode?: number })?.statusCode;
    // 404/410 = اشتراك ميّت (أُلغي التصريح أو حُذف التطبيق) → نظّفه
    if (code === 404 || code === 410) {
      await supabase.rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
    }
    return false;
  }
}

/**
 * إشعار تلقائي لكل من **تقدّم دوره** في نفس (الفرع + القسم) بعد إجلاس/إزالة.
 * يرسله التطبيق من نفسه — لا يحتاج أي ضغطة من الاستقبال.
 *
 * لتفادي الإزعاج: كل الإشعارات تحمل نفس الـtag فتُستبدل في مكانها بدل التكدّس،
 * والتنبيه الصوتي (renotify) يعمل فقط لمن اقترب دوره (أول ٣).
 */
export async function pushQueueRankUpdates(
  supabase: SupabaseClient<Database>,
  branchId: string,
  zone: string | null,
  venue: string,
  url: string,
): Promise<number> {
  if (!pushConfigured) { warnUnconfigured("rank-updates"); return 0; }

  try {
    const { data: targets, error } = await supabase.rpc("queue_push_targets", {
      p_branch_id: branchId,
      p_zone: zone,
    });
    if (error || !targets?.length) return 0;

    let sent = 0;
    await Promise.all(
      targets.map(async (t) => {
        const rank = t.rank;
        const payload: PushPayload =
          rank === 1
            ? {
                title: "أنت التالي 🟢",
                body: `لم يبقَ أحد أمامك في ${venue} — استعدّ.`,
                url,
                tag: "turn-queue",
                requireInteraction: true,
              }
            : rank <= 3
              ? {
                  title: `تقدّم دورك — رقمك الآن ${rank} 🔔`,
                  body: `أمامك ${rank - 1} في ${venue}. اقترب دورك.`,
                  url,
                  tag: "turn-queue",
                }
              : {
                  // بعيد عن الدور: تحديث صامت للرقم بلا تنبيه مزعج
                  title: `تقدّم دورك — رقمك الآن ${rank}`,
                  body: `أمامك ${rank - 1} في ${venue}.`,
                  url,
                  tag: "turn-queue",
                  silent: true,
                };

        if (await sendOne(supabase, t, JSON.stringify(payload))) sent += 1;
      }),
    );

    return sent;
  } catch {
    return 0;
  }
}

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
  if (!pushConfigured) { warnUnconfigured("entry"); return 0; }

  try {
    const { data: subs, error } = await supabase.rpc("push_subs_for_entry", {
      p_entry_id: entryId,
    });
    if (error || !subs?.length) return 0;

    const body = JSON.stringify(payload);
    let sent = 0;

    await Promise.all(
      subs.map(async (s) => {
        if (await sendOne(supabase, s, body)) sent += 1;
      }),
    );

    return sent;
  } catch {
    return 0;
  }
}
