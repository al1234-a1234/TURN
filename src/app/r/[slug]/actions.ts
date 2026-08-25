"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guestWriter } from "@/lib/supabase/guest-writes";
import { saudiMobile } from "@/lib/format";
import { pushRankUpdatesAfterSelfCancel } from "@/lib/push";
import { getLang } from "@/lib/i18n-server";
import { allowByIp } from "@/lib/ip-guard";
import { checkBotId } from "botid/server";
import type { Lang } from "@/lib/i18n";

/**
 * رسائل المسار العميلي بلغتين.
 *
 * كانت كلّها عربيّةً مثبَّتة: العميل يبدّل اللغة إلى الإنجليزية، ويملأ
 * النموذج، فيأتيه سببُ الرفض بالعربية — في اللحظة الوحيدة التي يحتاج فيها
 * أن يفهم. والإجراء يقرأ كوكي اللغة كما تقرؤه الصفحة (`getLang`)، فلا
 * حاجة لتمرير اللغة من المتصفّح ولا للوثوق بها.
 */
const MSG = {
  pickBranch: ["اختر الفرع.", "Choose a branch."],
  yourName: ["اكتب اسمك.", "Enter your name."],
  enterName: ["أدخل الاسم.", "Enter the name."],
  enterPhone: ["أدخل رقم الجوّال.", "Enter the mobile number."],
  badPhone: [
    "رقم الجوّال غير صحيح — يبدأ بـ 05 ويتكوّن من 10 خانات.",
    "Invalid mobile number — it starts with 05 and is 10 digits.",
  ],
  pickParty: ["اختر عدد الكراسي.", "Choose the party size."],
  pickZone: ["اختر المنطقة.", "Choose an area."],
  pickStars: ["اختر عدد النجوم.", "Choose a star rating."],
  pickSlot: ["اختر موعدًا.", "Choose a time."],
  noWaitlist: [
    "هذا الفرع لا يستقبل قائمة انتظار حاليًا.",
    "This branch isn't taking the queue right now.",
  ],
  noReservations: [
    "هذا الفرع لا يستقبل حجوزات حاليًا.",
    "This branch isn't taking reservations right now.",
  ],
  branchGone: ["الفرع غير متاح.", "This branch is unavailable."],
  // ‏P0432 — سُحب مفتاح الإيقاف العام. الصياغة تقول «نعرف، ونعمل، وارجع»:
  // العميل واقفٌ على باب مطعمٍ الآن، وأسوأ ما يُقال له «حدث خطأ ما».
  maintenance: [
    "التطبيق تحت الصيانة لدقائق — رجاءً جرّب بعد قليل، ودورك محفوظ إن كنت في الطابور.",
    "We're doing quick maintenance — try again shortly. Your place in line is safe.",
  ],
  branchClosed: ["الفرع مغلق حاليًا.", "This branch is closed right now."],
  slotTaken: [
    "امتلأ هذا الوقت للتوّ — اختر موعدًا آخر.",
    "That time just filled up — pick another.",
  ],
  slotPast: ["الموعد فات — اختر موعدًا قادمًا.", "That time has passed — pick a later one."],
  slotFar: [
    "الموعد أبعد ممّا يقبله المطعم.",
    "That's further ahead than this restaurant books.",
  ],
  tooMany: [
    "محاولات كثيرة — انتظر دقائق ثم حاول مجددًا.",
    "Too many attempts — wait a few minutes and try again.",
  ],
  // رسالة عمدًا مطابقة لحدّ العنوان: لا نُفصح للبوت أنه اكتُشف بالتحديد
  botBlocked: [
    "تعذّر إتمام الطلب الآن — حاول مرة أخرى بعد قليل.",
    "Couldn't complete the request right now — try again shortly.",
  ],
  tooManySoon: [
    "محاولات كثيرة — انتظر قليلًا ثم حاول.",
    "Too many attempts — wait a moment and try again.",
  ],
  signInFirst: [
    "سجّل الدخول أولاً للانضمام إلى قائمة الانتظار.",
    "Sign in first to join the queue.",
  ],
  noProfile: ["تعذّر إنشاء ملف العميل.", "Couldn't create your profile."],
  joinFailed: ["تعذّر الانضمام. حاول مرة أخرى.", "Couldn't join. Please try again."],
  queueFailed: [
    "تعذّر الانضمام للطابور. حاول مرة أخرى.",
    "Couldn't join the queue. Please try again.",
  ],
  bookFailed: ["تعذّر الحجز. حاول مرة أخرى.", "Couldn't book. Please try again."],
  reviewFailed: ["تعذّر إرسال التقييم. حاول مرة أخرى.", "Couldn't send your review. Please try again."],
  reviewFailedShort: ["تعذّر إرسال التقييم.", "Couldn't send your review."],
  // كانت جملةً معطوبة: شرطٌ مكرّر مرّتين في نصٍّ واحد يقرؤه العميل
  // («…خذ دورك أولًا — التقييم متاح ٧ أيام بعد الزيارة، والتقييم متاح ٧ أيام بعد الزيارة»)
  reviewNoVisit: [
    "التقييم لمن زار فعلًا — خذ دورك أولًا. وهو متاح ٧ أيام بعد الزيارة.",
    "Reviews are for guests who visited — take your turn first. Available for 7 days after your visit.",
  ],
  reviewLimit: ["وصلت حدّ التقييمات اليوم — عد غدًا.", "You've hit today's review limit — come back tomorrow."],
} as const;

function msg(lang: Lang, key: keyof typeof MSG): string {
  return MSG[key][lang === "en" ? 1 : 0];
}


export type WaitlistState = {
  ok: boolean;
  error?: string;
  position?: number;
  total?: number;
  entryId?: string;
  phone?: string;
};

// انضمام الضيف: اسم + رقم فقط، بدون تسجيل دخول
export async function joinWaitlistGuest(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const lang = await getLang();

  // بوّابة البوتات أوّل شيء: قبل أي لمسٍ للقاعدة أو حدّ العنوان — بوتٌ
  // مكتشَف لا يستحقّ حتى استهلاك حصّة allowByIp لعميلٍ حقيقيّ خلفه.
  const bot = await checkBotId({ advancedOptions: { checkLevel: "deepAnalysis" } });
  if (bot.isBot) return { ok: false, error: msg(lang, "botBlocked") };

  const supabase = await createClient();

  const slug = String(formData.get("slug") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  // تطبيع + تحقّق: يمنع حفظ عميل برقم مشوّه (كان يتشظّى العميل الواحد لعملاء)
  const phone = saudiMobile(String(formData.get("phone") ?? ""));
  // بلا افتراضٍ باسم قسم: resolveZone يختار أوّل قسمٍ رتّبه المالك
  const zoneRaw = String(formData.get("zone") ?? "");
  const partyRaw = Number(formData.get("party_size") ?? 1);

  if (!branchId) return { ok: false, error: msg(lang, "pickBranch") };
  if (!fullName) return { ok: false, error: msg(lang, "yourName") };
  if (!phone) return { ok: false, error: msg(lang, "badPhone") };

  // حدّ العنوان قبل ملامسة القاعدة: حدودها تُقاس بالرقم أو بالفرع، والمهاجم
  // يملك أرقامًا بلا حدّ ولا يملك عناوين بلا حدّ. عشرة في الدقيقة تكفي
  // عائلةً كاملة على شبكة مطعمٍ واحدة، ولا تكفي سكربتًا.
  if (!(await allowByIp("join", 10, 60_000))) {
    return { ok: false, error: msg(lang, "tooMany") };
  }

  // الموقع مطلوب في الواجهة (نافذة السماح إلزامية)، لكن الخادم لا يرفض
  // غيابه: جهازٌ سمح بالإذن وعجز عن التحديد (شبكة/GPS) يدخل بلا مسافة —
  // حبس عميل واقف على باب المطعم أسوأ من سطر مسافة ناقص. علمًا أن الرفض
  // الخادمي لم يكن حماية حقيقية أصلًا: أي نداء مباشر يرسل إحداثيات مزيفة.
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

  const zone = await resolveZone(supabase, branchId, zoneRaw);
  const partySize = await resolvePartySize(supabase, branchId, partyRaw);

  // الكتابة بقلم الخادم لا بمفتاح المتصفّح: كلّ ما فوق — حدّ العنوان،
  // تطبيع الرقم، قصّ القسم، سقف الحجم — كان يُتخطّى بنداءٍ مباشر يتجاوزنا.
  const writer = await guestWriter();
  const { data, error } = await writer.rpc("join_waitlist_guest", {
    p_branch_id: branchId,
    p_full_name: fullName,
    p_phone: phone,
    p_party_size: partySize,
    p_zone: zone,
  });

  if (error) {
    if (error.code === "P0001") {
      return { ok: false, error: msg(lang, "noWaitlist") };
    }
    if (error.code === "P0432") return { ok: false, error: msg(lang, "maintenance") };
    if (error.code === "P0002") return { ok: false, error: msg(lang, "branchGone") };
    if (error.code === "P0003") return { ok: false, error: msg(lang, "branchClosed") };
    if (error.code === "P0429") return { ok: false, error: msg(lang, "tooMany") };
    return { ok: false, error: msg(lang, "joinFailed") };
  }

  const row = Array.isArray(data) ? data[0] : data;

  // المسافة عن الفرع: تُحسب على الخادم من الإحداثيات، ولا تُخزَّن الإحداثيات
  if (row?.entry_id && hasCoords) {
    await writer.rpc("set_entry_distance", { p_entry_id: row.entry_id, p_lat: lat, p_lng: lng });
  }

  // الترتيب الحيّ نفسه الذي سيراه الاستطلاع والاستقبال — لا الرقم المخزَّن،
  // وإلا رأى العميل «5» ثم صارت «2» بعد أول نبضة (رقمان لمفهوم واحد).
  let livePos: number | undefined;
  let liveTotal: number | undefined;
  if (row?.entry_id) {
    const { data: st } = await supabase.rpc("waitlist_ticket_status", {
      p_entry_id: row.entry_id,
      p_phone: phone,
    });
    const t = Array.isArray(st) ? st[0] : st;
    livePos = t?.position ?? undefined;
    liveTotal = t?.total ?? undefined;
  }

  if (slug) revalidatePath(`/r/${slug}`);
  return {
    ok: true,
    position: livePos ?? row?.queue_pos ?? undefined,
    total: liveTotal ?? undefined,
    entryId: row?.entry_id ?? undefined,
    phone,
  };
}

/** حفظ اشتراك إشعارات الدفع للعميل (يُتحقّق من الصف + الرقم داخل الدالة). */
export async function savePushSubscription(
  entryId: string,
  phone: string,
  sub: { endpoint: string; p256dh: string; auth: string },
): Promise<boolean> {
  if (!entryId || !phone || !sub?.endpoint) return false;
  const supabase = await guestWriter();
  const { data, error } = await supabase.rpc("save_push_subscription", {
    p_entry_id: entryId,
    p_phone: phone,
    p_endpoint: sub.endpoint,
    p_p256dh: sub.p256dh,
    p_auth: sub.auth,
  });
  return !error && data === true;
}

export async function cancelWaitlistGuest(entryId: string, phone: string): Promise<boolean> {
  const supabase = await guestWriter();
  const { data, error } = await supabase.rpc("cancel_waitlist_guest", {
    p_entry_id: entryId,
    p_phone: phone,
  });
  const ok = !error && data === true;

  // من كان خلف المُلغي تقدّم دوره — أشعِرهم بعد ردّ الاستجابة (لا يعلّق زر الإلغاء)
  if (ok) after(async () => { await pushRankUpdatesAfterSelfCancel(supabase, entryId, phone); });

  return ok;
}

/**
 * يقصّ القسم المطلوب إلى ما يملكه الفرع فعلًا.
 *
 * الأقسام صارت يعرّفها المالك (branch_zones)، فلم يعد ثمّة قائمةٌ بيضاء
 * ثابتة. والواجهة تعرض المتاح وحده، لكن الحقل يصل من نموذجٍ في متصفّح
 * العميل — ونداءٌ مباشر أو صفحة قديمة في ذاكرة الجهاز قد يرسل قسمًا أُطفئ.
 *
 * لا نرفض ولا نُظهر خطأً: نضعه في أوّل قسمٍ رتّبه المالك بهدوء. رفضُ عميلٍ
 * واقفٍ على الباب لأجل حقلٍ لم يخترْه هو أسوأ الحلّين.
 */
/**
 * عدد الأشخاص — يُقصّ على سقف الفرع بهدوء ولا يُرفض به عميل.
 *
 * كان مثبَّتًا على ١ في مسار الطابور: المالك يضبط «أقصى عدد» في الإدارة،
 * والحجوزات تحترمه، والطابور يتجاهله — فيصل كل الطابور بشخصٍ واحد،
 * وتُبنى تقارير الذروة على رقمٍ كاذب.
 *
 * والقصّ لا الرفض: رفض عميلٍ واقفٍ على الباب لأجل رقمٍ يمكن تصحيحه
 * بصمتٍ أسوأ الحلَّين — نفس مبدأ `resolveZone`.
 */
async function resolvePartySize(
  supabase: Awaited<ReturnType<typeof createClient>>,
  branchId: string,
  requested: number,
): Promise<number> {
  const { data } = await supabase
    .from("branch_settings").select("max_party_size").eq("branch_id", branchId).maybeSingle();
  const max = Math.max(1, Number(data?.max_party_size ?? 20));
  const want = Number.isFinite(requested) ? Math.floor(requested) : 1;
  return Math.min(Math.max(want, 1), max);
}

async function resolveZone(
  supabase: Awaited<ReturnType<typeof createClient>>,
  branchId: string,
  requested: string,
): Promise<string> {
  const want = requested.trim();
  const { data } = await supabase
    .from("branch_zones")
    .select("key, sort_order")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("sort_order");

  const zones = data ?? [];
  if (zones.some((z) => z.key === want)) return want;
  // قسمٌ لا يخصّ الفرع ⇒ أوّل قسمٍ رتّبه المالك. والحارس في القاعدة
  // (trg_waitlist_zone_belongs) يفعل الشيء نفسه، فهذا حزامٌ ثانٍ لا بديل.
  return zones[0]?.key ?? want;
}

export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const lang = await getLang();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: msg(lang, "signInFirst") };
  }

  const slug = String(formData.get("slug") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const partySize = Number(formData.get("party_size") ?? 0);
  const zone = String(formData.get("zone") ?? "any");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!branchId) return { ok: false, error: msg(lang, "pickBranch") };
  if (!fullName) return { ok: false, error: msg(lang, "enterName") };
  if (!phone) return { ok: false, error: msg(lang, "enterPhone") };
  if (!Number.isInteger(partySize) || partySize < 1) {
    return { ok: false, error: msg(lang, "pickParty") };
  }
  if (!zone.trim()) return { ok: false, error: msg(lang, "pickZone") };

  const { data: settings } = await supabase
    .from("branch_settings")
    .select("accepts_waitlist, max_party_size")
    .eq("branch_id", branchId)
    .maybeSingle();

  if (settings && settings.accepts_waitlist === false) {
    return { ok: false, error: msg(lang, "noWaitlist") };
  }
  const maxParty = settings?.max_party_size ?? 20;
  if (partySize > maxParty) {
    return { ok: false, error: `الحد الأقصى ${maxParty} أشخاص.` };
  }

  // إيجاد/إنشاء ملف العميل
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = existing?.id;
  if (!customerId) {
    const { data: created, error: cErr } = await supabase
      .from("customers")
      .insert({ user_id: user.id, full_name: fullName, phone })
      .select("id")
      .single();
    if (cErr || !created) return { ok: false, error: msg(lang, "noProfile") };
    customerId = created.id;
  } else {
    await supabase
      .from("customers")
      .update({ full_name: fullName, phone })
      .eq("id", customerId);
  }

  // الانضمام (الترتيب position يُحسب تلقائيًا عبر trigger)
  const { data: entry, error: wErr } = await supabase
    .from("waitlist_entries")
    .insert({ branch_id: branchId, customer_id: customerId, party_size: partySize, zone, notes })
    .select("position")
    .single();

  if (wErr || !entry) {
    return { ok: false, error: msg(lang, "queueFailed") };
  }

  if (slug) revalidatePath(`/r/${slug}`);
  return { ok: true, position: entry.position ?? undefined };
}

export type ReviewState = { ok: boolean; error?: string };

/** كتابة تقييم — محروس في القاعدة: زيارة فعلية (إجلاس/مسح) خلال ٧ أيام. */
export async function submitReview(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const lang = await getLang();
  const slug = String(formData.get("slug") ?? "");
  const phone = saudiMobile(String(formData.get("phone") ?? ""));
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "").trim();

  if (!phone) return { ok: false, error: msg(lang, "badPhone") };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: msg(lang, "pickStars") };

  const supabase = await guestWriter();
  const { data, error } = await supabase.rpc("submit_review", {
    p_slug: slug,
    p_phone: phone,
    p_rating: rating,
    p_comment: comment || undefined,
  });
  if (error) return { ok: false, error: msg(lang, "reviewFailed") };

  const r = (data ?? {}) as { ok?: boolean; error?: string };
  if (!r.ok) {
    if (r.error === "no_visit") return { ok: false, error: msg(lang, "reviewNoVisit") };
    if (r.error === "rate_limited") return { ok: false, error: msg(lang, "reviewLimit") };
    return { ok: false, error: msg(lang, "reviewFailedShort") };
  }
  if (slug) revalidatePath(`/r/${slug}`);
  return { ok: true };
}

export type ReserveState = {
  ok: boolean;
  error?: string;
  /** اسم الطاولة المخصّصة — يطمئن العميل أن الحجز حجزُ طاولةٍ بعينها */
  table?: string;
  /** الموعد كما ثبّتته القاعدة (ISO) — لا كما ظنّه المتصفّح */
  at?: string;
  /**
   * معرّف الحجز — يُعاد للمتصفّح ليحفظه جهازُه (`recordBooking`).
   * ضروريّ بعد 0104: الاستعلام بالرقم لم يعد يُرجع معرّفًا، فلولا حفظه هنا
   * لما استطاع صاحبُ الحجز إلغاءه من «حسابي».
   */
  id?: string;
};

/**
 * حجز الضيف — بلا حساب ولا كلمة مرور، كالطابور تمامًا.
 *
 * الطاولة تُختار في القاعدة (أصغر مقاسٍ يكفي) لا هنا: التزامن يُحسم بقيد
 * no_double_booking، فشرطٌ في التطبيق قد يسبقه طلبٌ آخر بجزءٍ من الثانية.
 */
export async function bookReservationGuest(
  _prev: ReserveState,
  formData: FormData,
): Promise<ReserveState> {
  const lang = await getLang();

  const bot = await checkBotId({ advancedOptions: { checkLevel: "deepAnalysis" } });
  if (bot.isBot) return { ok: false, error: msg(lang, "botBlocked") };

  const slug = String(formData.get("slug") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = saudiMobile(String(formData.get("phone") ?? ""));
  const at = String(formData.get("reserved_at") ?? "").trim();
  const partyRaw = Number(formData.get("party_size") ?? 2);
  const zoneRaw = String(formData.get("zone") ?? "");
  // القاعدة تتحقّق منه بـ valid_branch_zone وترفض صراحةً إن لم يصحّ — فلا
  // نبتلعه هنا إلى undefined («أيّ قسم») ونحجز للعميل في غير ما اختار.
  const zone = zoneRaw.trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!branchId) return { ok: false, error: msg(lang, "pickBranch") };
  if (!fullName) return { ok: false, error: msg(lang, "yourName") };
  if (!phone) return { ok: false, error: msg(lang, "badPhone") };
  // الموعد يصل ISO كاملًا من قائمة المواعيد المتاحة، فلا نعيد تفسير منطقةٍ زمنية
  const when = new Date(at);
  if (!at || Number.isNaN(when.getTime())) return { ok: false, error: msg(lang, "pickSlot") };

  // الحجز أثمن من الدور: كلٌّ منه يحتجز طاولةً حقيقية ويحرمها من عميلٍ آخر
  if (!(await allowByIp("book", 6, 60_000))) {
    return { ok: false, error: msg(lang, "tooManySoon") };
  }

  const supabase = await guestWriter();
  const { data, error } = await supabase.rpc("book_reservation_guest", {
    p_branch_id: branchId,
    p_full_name: fullName,
    p_phone: phone,
    p_reserved_at: when.toISOString(),
    p_party_size: Number.isFinite(partyRaw) ? Math.max(1, Math.floor(partyRaw)) : 2,
    p_zone: zone,
    p_notes: notes,
  });

  if (error) {
    // «امتلأ للتوّ» ليس خطأً في العميل: بين عرض المواعيد وضغطه حجز غيرُه
    if (error.code === "P0432") return { ok: false, error: msg(lang, "maintenance") };
    if (error.code === "P0006" || error.code === "P0007") {
      return { ok: false, error: msg(lang, "slotTaken") };
    }
    if (error.code === "P0001") return { ok: false, error: msg(lang, "noReservations") };
    if (error.code === "P0002") return { ok: false, error: msg(lang, "branchGone") };
    if (error.code === "P0004") return { ok: false, error: msg(lang, "slotPast") };
    if (error.code === "P0005") return { ok: false, error: msg(lang, "slotFar") };
    if (error.code === "P0429") return { ok: false, error: msg(lang, "tooManySoon") };
    console.error("[bookReservationGuest]", error.code, error.message);
    return { ok: false, error: msg(lang, "bookFailed") };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { reservation_id?: string; table_label?: string; reserved_at?: string }
    | null;
  if (slug) revalidatePath(`/r/${slug}`);
  return {
    ok: true,
    table: row?.table_label ?? undefined,
    at: row?.reserved_at ?? when.toISOString(),
    id: row?.reservation_id ?? undefined,
  };
}
