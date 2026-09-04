import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeadSubscription } from "@/lib/push-dead";

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

/**
 * مسارات الضيف تحتاج مفتاح الخدمة: دوالّها سُحبت من `anon` كي لا تُعيد بيانات
 * اشتراك الطابور لمن يملك المفتاح العام (وهو معلومٌ لكل من فتح الصفحة).
 *
 * إن غاب المتغيّر نرجع لعميل المستدعي كي لا ينقطع الإشعار فجأةً بين نشرٍ ونشر،
 * ونصرخ في السجلّ صرخةً يلتقطها Sentry — فالرجوع مؤقّتٌ لا وضعٌ دائم.
 */
function guestClient(
  fallback: SupabaseClient<Database>,
  where: string,
): SupabaseClient<Database> {
  const admin = createAdminClient();
  if (admin) return admin;
  console.error(
    `[push] ${where}: SUPABASE_SERVICE_ROLE_KEY غير مضبوط — أضِفه في Vercel ثم أعِد النشر.`,
  );
  return fallback;
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

/**
 * سجلّ الإرسال — يُكتب بعد كل دفعة، لا داخلها.
 *
 * كان `notifications` فارغًا منذ أوّل يوم ونحن نرسل: نعدّ في الذاكرة ونرجع
 * رقمًا يذهب أدراج الرياح. فلا نعرف من وصله ولا من رُفض ولا لماذا، ولو بدأت
 * آبل ترفض لما علمنا إلا من شكوى مطعم. والفشل الصامت هو نفسه ما أبقى مفتاح
 * الخدمة معطوبًا أحد عشر يومًا.
 *
 * نداءٌ واحد للدفعة كلّها: إجلاسٌ في فرعٍ ممتلئ قد يرسل مئة إشعار، ومئةُ
 * نداءٍ للقاعدة ثمنٌ بلا مقابل. ولا يرمي أبدًا — السجلّ خادمٌ للإشعار لا سيّده.
 */
type SendLog = { endpoint: string; template: string; delivered: boolean; error?: string };
/** حصيلة دفعة: ما يُسجَّل، وما مات من اشتراكات (يُحذف **بعد** التسجيل). */
type Batch = { log: SendLog[]; dead: string[] };
const newBatch = (): Batch => ({ log: [], dead: [] });

/**
 * الترتيب هنا ليس تفصيلًا: السجلّ ينسب الصفّ إلى صاحبه عبر جدول الاشتراكات،
 * فلو حُذف الاشتراك الميّت أوّلًا لضاع أهمّ صفٍّ نريده — الفشل نفسه.
 */
async function finishBatch(supabase: SupabaseClient<Database>, batch: Batch): Promise<void> {
  // بمفتاح الخدمة لا بعميل المنادي: أكثر الإشعارات تنطلق من فعل موظّفٍ
  // (إجلاس/إزالة)، وعميلُه `authenticated`. ولو مُنح المسجَّلون كتابة
  // السجلّ لصار بإمكان أيّ حسابٍ أن يزرع فيه سطورًا — وسجلٌّ يُكتب من
  // الخارج لا يصلح شهادةً حين يُسأل: «هل وصل العميلَ تنبيه؟».
  const db = createAdminClient() ?? supabase;

  if (batch.log.length) {
    try {
      await db.rpc("log_push_sends", { p_rows: batch.log });
    } catch {
      /* تعذّر التسجيل لا يُبطل إشعارًا وصل */
    }
  }
  for (const endpoint of batch.dead) {
    try {
      await db.rpc("delete_dead_push_subscription", { p_endpoint: endpoint });
    } catch {
      /* التنظيف يُعاد في المحاولة القادمة */
    }
  }
}

/** إرسال دفعة واحدة لاشتراك، مع تعليم الاشتراك الميّت. يعيد true إن نجح. */
async function sendOne(
  supabase: SupabaseClient<Database>,
  sub: { endpoint: string; p256dh: string; auth: string },
  body: string,
  batch?: Batch,
  template = "queue",
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      body,
    );
    batch?.log.push({ endpoint: sub.endpoint, template, delivered: true });
    return true;
  } catch (err) {
    const code = (err as { statusCode?: number })?.statusCode;
    const reason = `${(err as { body?: string })?.body ?? (err as Error)?.message ?? ""}`;
    batch?.log.push({
      endpoint: sub.endpoint,
      template,
      delivered: false,
      error: `${code ?? "?"}: ${reason}`.slice(0, 300),
    });
    // اشتراكٌ ميّت → يُنظَّف بعد التسجيل (انظر `isDeadSubscription`).
    // ملاحظة: `delete_dead_push_subscription` محجوبة عن `anon`. فمسار الضيف
    // كان ينظّف بلا صلاحية، فيفشل بصمت وتتراكم الاشتراكات الميّتة إلى الأبد.
    // يعمل الآن لأن مسارات الضيف تمرّ عميل الخدمة إلى هنا.
    if (isDeadSubscription(code, reason)) {
      if (batch) batch.dead.push(sub.endpoint);
      else await supabase.rpc("delete_dead_push_subscription", { p_endpoint: sub.endpoint });
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
      p_zone: zone as unknown as string, // null = قسم غير محدّد (is not distinct from)
    });
    if (error || !targets?.length) return 0;

    let sent = 0;
    const batch = newBatch();
    await Promise.all(
      targets.map(async (t) => {
        const body = JSON.stringify(rankPayload(t.rank, venue, url));
        if (await sendOne(supabase, t, body, batch, "queue_rank")) sent += 1;
      }),
    );
    await finishBatch(supabase, batch);

    return sent;
  } catch (err) {
    console.error("[pushQueueRankUpdates]", branchId, err);
    return 0;
  }
}

/** يبني نصّ إشعار «تقدّم دورك» حسب الترتيب الجديد. */
function rankPayload(rank: number, venue: string, url: string): PushPayload {
  if (rank === 1) {
    return {
      title: "أنت التالي 🟢",
      body: `لم يبقَ أحد أمامك في ${venue} — استعدّ.`,
      url,
      tag: "turn-queue",
      requireInteraction: true,
    };
  }
  if (rank <= 3) {
    return {
      title: `تقدّم دورك — رقمك الآن ${rank} 🔔`,
      body: `أمامك ${rank - 1} في ${venue}. اقترب دورك.`,
      url,
      tag: "turn-queue",
    };
  }
  // بعيد عن الدور: تحديث صامت للرقم بلا تنبيه مزعج
  return {
    title: `تقدّم دورك — رقمك الآن ${rank}`,
    body: `أمامك ${rank - 1} في ${venue}.`,
    url,
    tag: "turn-queue",
    silent: true,
  };
}

/** إشعار من تقدّم دوره بعد إلغاءٍ من رابط التذكرة (بلا رقم جوّال). */
export async function pushRankUpdatesAfterTicketCancel(
  supabase: SupabaseClient<Database>,
  entryId: string,
): Promise<number> {
  if (!pushConfigured) { warnUnconfigured("ticket-cancel"); return 0; }

  try {
    const db = guestClient(supabase, "ticket-cancel");
    const { data: targets, error } = await db.rpc(
      "queue_push_targets_after_ticket_cancel",
      { p_entry_id: entryId },
    );
    if (error || !targets?.length) return 0;

    let sent = 0;
    const batch = newBatch();
    await Promise.all(
      targets.map(async (t) => {
        const url = t.slug ? `/r/${t.slug}` : "/";
        const body = JSON.stringify(rankPayload(t.rank, t.venue ?? "المطعم", url));
        if (await sendOne(db, t, body, batch, "queue_rank")) sent += 1;
      }),
    );
    await finishBatch(db, batch);
    return sent;
  } catch (err) {
    console.error("[pushRankUpdatesAfterTicketCancel]", entryId, err);
    return 0;
  }
}

/**
 * إشعار من تقدّم دوره بعد أن ألغى عميلٌ **دورَه بنفسه** من التذكرة.
 * كان هذا المسار صامتًا: الإشعار التلقائي كان معلّقًا على إجراءات الاستقبال فقط.
 */
export async function pushRankUpdatesAfterSelfCancel(
  supabase: SupabaseClient<Database>,
  entryId: string,
  phone: string,
): Promise<number> {
  if (!pushConfigured) { warnUnconfigured("self-cancel"); return 0; }

  try {
    const db = guestClient(supabase, "self-cancel");
    const { data: targets, error } = await db.rpc("queue_push_targets_after_cancel", {
      p_entry_id: entryId,
      p_phone: phone,
    });
    if (error || !targets?.length) return 0;

    let sent = 0;
    const batch = newBatch();
    await Promise.all(
      targets.map(async (t) => {
        const venue = t.venue ?? "المطعم";
        const url = t.slug ? `/r/${t.slug}` : "/";
        const body = JSON.stringify(rankPayload(t.rank, venue, url));
        if (await sendOne(db, t, body, batch, "queue_rank")) sent += 1;
      }),
    );
    await finishBatch(db, batch);
    return sent;
  } catch (err) {
    console.error("[pushRankUpdatesAfterSelfCancel]", entryId, err);
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
    const batch = newBatch();

    await Promise.all(
      subs.map(async (s) => {
        if (await sendOne(supabase, s, body, batch, payload.tag ?? "entry")) sent += 1;
      }),
    );
    await finishBatch(supabase, batch);

    return sent;
  } catch (err) {
    console.error("[pushToWaitlistEntry]", entryId, err);
    return 0;
  }
}
