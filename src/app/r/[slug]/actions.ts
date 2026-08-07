"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saudiMobile } from "@/lib/format";
import { pushRankUpdatesAfterSelfCancel } from "@/lib/push";

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
  const supabase = await createClient();

  const slug = String(formData.get("slug") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  // تطبيع + تحقّق: يمنع حفظ عميل برقم مشوّه (كان يتشظّى العميل الواحد لعملاء)
  const phone = saudiMobile(String(formData.get("phone") ?? ""));
  // بلا افتراضٍ باسم قسم: resolveZone يختار أوّل قسمٍ رتّبه المالك
  const zoneRaw = String(formData.get("zone") ?? "");
  const partyRaw = Number(formData.get("party_size") ?? 1);

  if (!branchId) return { ok: false, error: "اختر الفرع." };
  if (!fullName) return { ok: false, error: "اكتب اسمك." };
  if (!phone) return { ok: false, error: "رقم الجوّال غير صحيح — يبدأ بـ 05 ويتكوّن من 10 خانات." };

  // الموقع مطلوب في الواجهة (نافذة السماح إلزامية)، لكن الخادم لا يرفض
  // غيابه: جهازٌ سمح بالإذن وعجز عن التحديد (شبكة/GPS) يدخل بلا مسافة —
  // حبس عميل واقف على باب المطعم أسوأ من سطر مسافة ناقص. علمًا أن الرفض
  // الخادمي لم يكن حماية حقيقية أصلًا: أي نداء مباشر يرسل إحداثيات مزيفة.
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

  const zone = await resolveZone(supabase, branchId, zoneRaw);
  const partySize = await resolvePartySize(supabase, branchId, partyRaw);

  const { data, error } = await supabase.rpc("join_waitlist_guest", {
    p_branch_id: branchId,
    p_full_name: fullName,
    p_phone: phone,
    p_party_size: partySize,
    p_zone: zone,
  });

  if (error) {
    if (error.code === "P0001") {
      return { ok: false, error: "هذا الفرع لا يستقبل قائمة انتظار حاليًا." };
    }
    if (error.code === "P0002") return { ok: false, error: "الفرع غير متاح." };
    if (error.code === "P0003") return { ok: false, error: "الفرع مغلق حاليًا." };
    if (error.code === "P0429") return { ok: false, error: "محاولات كثيرة — انتظر دقائق ثم حاول مجددًا." };
    return { ok: false, error: "تعذّر الانضمام. حاول مرة أخرى." };
  }

  const row = Array.isArray(data) ? data[0] : data;

  // المسافة عن الفرع: تُحسب على الخادم من الإحداثيات، ولا تُخزَّن الإحداثيات
  if (row?.entry_id && hasCoords) {
    await supabase.rpc("set_entry_distance", { p_entry_id: row.entry_id, p_lat: lat, p_lng: lng });
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
  const supabase = await createClient();
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
  const supabase = await createClient();
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "سجّل الدخول أولاً للانضمام إلى قائمة الانتظار." };
  }

  const slug = String(formData.get("slug") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const partySize = Number(formData.get("party_size") ?? 0);
  const zone = String(formData.get("zone") ?? "any");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!branchId) return { ok: false, error: "اختر الفرع." };
  if (!fullName) return { ok: false, error: "أدخل الاسم." };
  if (!phone) return { ok: false, error: "أدخل رقم الجوّال." };
  if (!Number.isInteger(partySize) || partySize < 1) {
    return { ok: false, error: "اختر عدد الكراسي." };
  }
  if (!zone.trim()) return { ok: false, error: "اختر المنطقة." };

  const { data: settings } = await supabase
    .from("branch_settings")
    .select("accepts_waitlist, max_party_size")
    .eq("branch_id", branchId)
    .maybeSingle();

  if (settings && settings.accepts_waitlist === false) {
    return { ok: false, error: "هذا الفرع لا يستقبل قائمة انتظار حاليًا." };
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
    if (cErr || !created) return { ok: false, error: "تعذّر إنشاء ملف العميل." };
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
    return { ok: false, error: "تعذّر الانضمام للطابور. حاول مرة أخرى." };
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
  const slug = String(formData.get("slug") ?? "");
  const phone = saudiMobile(String(formData.get("phone") ?? ""));
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "").trim();

  if (!phone) return { ok: false, error: "رقم الجوّال غير صحيح — يبدأ بـ 05 ويتكوّن من 10 خانات." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "اختر عدد النجوم." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_review", {
    p_slug: slug,
    p_phone: phone,
    p_rating: rating,
    p_comment: comment || undefined,
  });
  if (error) return { ok: false, error: "تعذّر إرسال التقييم. حاول مرة أخرى." };

  const r = (data ?? {}) as { ok?: boolean; error?: string };
  if (!r.ok) {
    if (r.error === "no_visit") return { ok: false, error: "التقييم لمن زار فعلًا — خذ دورك أولًا — التقييم متاح ٧ أيام بعد الزيارة، والتقييم متاح ٧ أيام بعد الزيارة." };
    if (r.error === "rate_limited") return { ok: false, error: "وصلت حدّ التقييمات اليوم — عد غدًا." };
    return { ok: false, error: "تعذّر إرسال التقييم." };
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

  if (!branchId) return { ok: false, error: "اختر الفرع." };
  if (!fullName) return { ok: false, error: "اكتب اسمك." };
  if (!phone) return { ok: false, error: "رقم الجوّال غير صحيح — يبدأ بـ 05 ويتكوّن من 10 خانات." };
  // الموعد يصل ISO كاملًا من قائمة المواعيد المتاحة، فلا نعيد تفسير منطقةٍ زمنية
  const when = new Date(at);
  if (!at || Number.isNaN(when.getTime())) return { ok: false, error: "اختر موعدًا." };

  const supabase = await createClient();
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
    if (error.code === "P0006" || error.code === "P0007") {
      return { ok: false, error: "امتلأ هذا الوقت للتوّ — اختر موعدًا آخر." };
    }
    if (error.code === "P0001") return { ok: false, error: "هذا الفرع لا يستقبل حجوزات حاليًا." };
    if (error.code === "P0002") return { ok: false, error: "الفرع غير متاح." };
    if (error.code === "P0004") return { ok: false, error: "الموعد فات — اختر موعدًا قادمًا." };
    if (error.code === "P0005") return { ok: false, error: "الموعد أبعد ممّا يقبله المطعم." };
    if (error.code === "P0429") return { ok: false, error: "محاولات كثيرة — انتظر قليلًا ثم حاول." };
    console.error("[bookReservationGuest]", error.code, error.message);
    return { ok: false, error: "تعذّر الحجز. حاول مرة أخرى." };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { table_label?: string; reserved_at?: string }
    | null;
  if (slug) revalidatePath(`/r/${slug}`);
  return { ok: true, table: row?.table_label ?? undefined, at: row?.reserved_at ?? when.toISOString() };
}
