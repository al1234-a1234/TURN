"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";
import type { TablesUpdate } from "@/lib/supabase/database.types";


export async function updateCustomerProfile(
  customerId: string,
  patch: { is_vip?: boolean; note?: string | null; is_blocked?: boolean },
) {
  const caller = await requirePerm("customers");
  if (!caller || !customerId) return;

  const update: TablesUpdate<"customer_restaurant"> = {};
  if (patch.is_vip !== undefined) update.is_vip = patch.is_vip;
  if (patch.is_blocked !== undefined) update.is_blocked = patch.is_blocked;
  if (patch.note !== undefined) update.note = patch.note?.trim() || null;
  if (Object.keys(update).length === 0) return;

  // RLS يفرض staff_has_perm(rid,'customers') — المفتاح المركّب (المطعم + العميل)
  const { error } = await caller.supabase
    .from("customer_restaurant")
    .update(update)
    .eq("restaurant_id", caller.restaurantId)
    .eq("customer_id", customerId);

  // لا نُبطل الكاش على كتابةٍ فشلت: إعادة التحقّق تعرض القيمة القديمة كأنها
  // محفوظة، فيظنّ المالك أن الحظر/الملاحظة سرت وهي لم تُكتب.
  if (error) {
    console.error("[updateCustomerProfile]", error.message);
    return;
  }

  revalidatePath("/dashboard/customers");
}

/** منح العميل هديّة أو خصم — يراها في «الهدايا» ويسلّحها بنفسه. */
export async function grantReward(formData: FormData): Promise<boolean> {
  const caller = await requirePerm("customers");
  if (!caller) return false;

  const customerId = String(formData.get("customer_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!customerId || !title) return false;

  // تأكيد أن العميل ينتمي لهذا المطعم (لا مكافآت لعملاء لم يزوروه)
  const { data: member } = await caller.supabase
    .from("customer_restaurant")
    .select("customer_id")
    .eq("restaurant_id", caller.restaurantId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (!member) return false;

  const kind = String(formData.get("kind") ?? "gift") === "discount" ? "discount" : "gift";
  const valueRaw = String(formData.get("value") ?? "").trim();
  const value = valueRaw ? Number(valueRaw) : null;
  const valueKind = String(formData.get("value_kind") ?? "percent") === "amount" ? "amount" : "percent";
  const description = String(formData.get("description") ?? "").trim() || null;
  const code = String(formData.get("code") ?? "").trim().toUpperCase() || null;
  const daysRaw = String(formData.get("expires_days") ?? "").trim();
  const days = daysRaw ? Math.max(1, Number(daysRaw)) : null;
  const expires_at = days ? new Date(Date.now() + days * 864e5).toISOString() : null;

  const { error } = await caller.supabase.from("customer_rewards").insert({
    restaurant_id: caller.restaurantId,
    customer_id: customerId,
    kind,
    title,
    value: kind === "discount" && Number.isFinite(value as number) ? value : null,
    value_kind: valueKind,
    description,
    code,
    created_by: caller.userId,
    expires_at,
  });

  if (error) {
    console.error("[grantReward]", error.message);
    return false;
  }

  revalidatePath(`/dashboard/customers/${customerId}`);
  return true;
}

/** منح مكافأة لشريحة كاملة: الكل / VIP / عائدون / جدد / غائبون. */
export async function grantRewardToSegment(formData: FormData) {
  const caller = await requirePerm("customers");
  if (!caller) return;

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const segment = String(formData.get("segment") ?? "all");
  const kind = String(formData.get("kind") ?? "gift") === "discount" ? "discount" : "gift";
  const valueRaw = String(formData.get("value") ?? "").trim();
  const value = valueRaw ? Number(valueRaw) : null;
  const valueKind = String(formData.get("value_kind") ?? "percent") === "amount" ? "amount" : "percent";
  const description = String(formData.get("description") ?? "").trim() || null;
  const code = String(formData.get("code") ?? "").trim().toUpperCase() || null;
  const daysRaw = String(formData.get("expires_days") ?? "").trim();
  const days = daysRaw ? Math.max(1, Number(daysRaw)) : null;
  const expires_at = days ? new Date(Date.now() + days * 864e5).toISOString() : null;

  // إدراج set-based لكل الشريحة بجملة واحدة (يتوسّع لأي عدد عملاء)
  const { error } = await caller.supabase.rpc("grant_reward_to_segment", {
    p_restaurant_id: caller.restaurantId,
    p_segment: segment,
    p_kind: kind,
    p_title: title,
    // القيم الفارغة null مقبولة في الدالة (nullif داخلها) — الأنواع المولَّدة أضيق من الواقع
    p_value: value as unknown as number,
    p_value_kind: valueKind,
    p_description: description as unknown as string,
    p_code: code as unknown as string,
    p_expires_at: expires_at as unknown as string,
  });

  // منحُ شريحة إما ينجح كله أو لا شيء — بثّ نجاحٍ وهمي يجعل المالك يظنّ
  // أن الحملة انطلقت فلا يعيدها، والشريحة كلها بلا هدية.
  if (error) {
    console.error("[grantRewardToSegment]", error.message);
    return;
  }

  revalidatePath("/dashboard/customers");
}

/**
 * شريحة يعرّفها المالك بمقياسه هو («فضّي» عند ٥ زيارات، «ذهبي» عند ١٠).
 * القيم مقصوصة هنا قبل الإدراج: قيد check في القاعدة يرتدّ برسالة خام
 * لا يفهمها المالك، وحدُّ أعلى دون الأدنى يصنع شريحة فارغة أبدًا.
 */
export async function createSegment(formData: FormData) {
  const caller = await requirePerm("customers");
  if (!caller) return;

  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  if (!name) return;

  const num = (key: string): number | null => {
    const raw = String(formData.get(key) ?? "").replace(/\D/g, "");
    return raw === "" ? null : Number(raw);
  };
  const minVisits = Math.min(10000, Math.max(0, num("min_visits") ?? 0));
  const rawMax = num("max_visits");
  const maxVisits = rawMax === null ? null : Math.min(10000, Math.max(minVisits, rawMax));
  const rawInactive = num("inactive_days");
  const inactiveDays = rawInactive === null || rawInactive <= 0 ? null : Math.min(3650, rawInactive);

  const { error } = await caller.supabase.from("customer_segments").insert({
    restaurant_id: caller.restaurantId,
    name,
    min_visits: minVisits,
    max_visits: maxVisits,
    inactive_days: inactiveDays,
  });

  // اسم مكرّر أو قيد مرفوض: لا نُبطل الكاش فتظهر الشريحة كأنها حُفظت وهي لم تُكتب
  if (error) {
    console.error("[createSegment]", error.message);
    return;
  }

  revalidatePath("/dashboard/customers");
}

/** حذف شريحة — مقيّد بمطعم المتصل حتى لا يمسّ معرّفٌ مسروق شريحة مطعمٍ آخر. */
export async function deleteSegment(formData: FormData) {
  const caller = await requirePerm("customers");
  if (!caller) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await caller.supabase
    .from("customer_segments")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", caller.restaurantId);

  if (error) {
    console.error("[deleteSegment]", error.message);
    return;
  }

  revalidatePath("/dashboard/customers");
}

/** منح مكافأة لشريحة مخصّصة — يعيد عدد من وصلتهم فعلًا. */
export async function grantRewardToCustomSegment(formData: FormData): Promise<number> {
  const caller = await requirePerm("customers");
  if (!caller) return 0;

  const segmentId = String(formData.get("segment_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!segmentId || !title) return 0;

  const kind = String(formData.get("kind") ?? "gift") === "discount" ? "discount" : "gift";
  const valueRaw = String(formData.get("value") ?? "").trim();
  const value = valueRaw ? Number(valueRaw) : null;
  const valueKind = String(formData.get("value_kind") ?? "percent") === "amount" ? "amount" : "percent";
  const description = String(formData.get("description") ?? "").trim() || null;
  const code = String(formData.get("code") ?? "").trim().toUpperCase() || null;
  const daysRaw = String(formData.get("expires_days") ?? "").trim();
  const days = daysRaw ? Math.max(1, Number(daysRaw)) : null;
  const expires_at = days ? new Date(Date.now() + days * 864e5).toISOString() : null;

  // الدالة تتحقّق من ملكيّة الشريحة وتُدرج للأعضاء بجملة واحدة (set-based)
  const { data, error } = await caller.supabase.rpc("grant_reward_to_custom_segment", {
    p_segment_id: segmentId,
    p_kind: kind,
    p_title: title,
    // القيم الفارغة null مقبولة داخل الدالة — الأنواع المولَّدة أضيق من الواقع
    p_value: value as unknown as number,
    p_value_kind: valueKind,
    p_description: description as unknown as string,
    p_code: code as unknown as string,
    p_expires_at: expires_at as unknown as string,
  });

  // كما في grantRewardToSegment: نجاحٌ وهمي يجعل المالك لا يعيد الحملة أبدًا
  if (error) {
    console.error("[grantRewardToCustomSegment]", error.message);
    return 0;
  }

  revalidatePath("/dashboard/customers");
  return data ?? 0;
}

/** إلغاء مكافأة (تعليمها منتهية). */
export async function revokeReward(formData: FormData) {
  const caller = await requirePerm("customers");
  if (!caller) return;
  const rewardId = String(formData.get("reward_id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");
  if (!rewardId) return;
  // إلغاء يظهر ناجحًا وهو فاشل = مكافأة يظنّها المالك ملغاة والعميل يصرفها.
  // وغياب الخطأ لا يكفي دليلًا: معرّفٌ لا يخصّ هذا المطعم يُطابق صفرَ صفوف بلا
  // خطأ. عدد الصفوف هو الحكم — كما في redeemReward.
  const { data: revoked, error } = await caller.supabase
    .from("customer_rewards")
    .update({ status: "expired" })
    .eq("id", rewardId)
    .eq("restaurant_id", caller.restaurantId)
    .select("id");
  if (error) {
    console.error("[revokeReward]", error.message);
    return;
  }
  if ((revoked?.length ?? 0) === 0) {
    console.error("[revokeReward] no reward matched", rewardId);
    return;
  }
  revalidatePath(`/dashboard/customers/${customerId}`);
}

/** اعتماد استخدام المكافأة من طرف الطاقم (العميل يقدّمها عند الطلب). */
export async function redeemReward(formData: FormData) {
  const caller = await requirePerm("customers");
  if (!caller) return;
  const rewardId = String(formData.get("reward_id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");
  if (!rewardId) return;
  // .select() لا زينة: الشرط eq("status","active") يجعل الصرف الثاني يُطابق
  // صفرَ صفوف ويعود **بلا خطأ**. ففحص error وحده يمرّره كنجاح، وموظّفان يضغطان
  // معًا (أو ضغطة مكرّرة على شبكة بطيئة) يريان «تمّ» مرّتين على هدية واحدة.
  // عدد الصفوف العائدة هو الحكم الوحيد الصادق: صفر = لم تُصرف الآن.
  const { data: redeemed, error } = await caller.supabase
    .from("customer_rewards")
    .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
    .eq("id", rewardId)
    .eq("restaurant_id", caller.restaurantId)
    .eq("status", "active")
    .select("id");
  if (error) {
    console.error("[redeemReward]", error.message);
    return;
  }
  if ((redeemed?.length ?? 0) === 0) {
    // إمّا صُرفت قبل قليل، أو أُلغيت، أو ليست لهذا المطعم — الحالة على الشاشة
    // قديمة. لا نُبطل الكاش بادّعاء صرفٍ لم يحدث؛ إعادة التحميل تُظهر الحقيقة.
    console.error("[redeemReward] no active reward matched", rewardId);
    return;
  }
  revalidatePath(`/dashboard/customers/${customerId}`);
}

/**
 * ضبط هدية الاسترجاع التلقائية.
 *
 * كانت تُضبط في صفحة «الولاء» بين النقاط والعتبات وسقطت معها. الاسترجاع
 * منحُ هدية لمن غاب — فمكانه حيث تُمنح الهدايا، والكرون الليلي يتكفّل
 * بالباقي عبر run_auto_winback().
 */
export async function saveWinback(formData: FormData): Promise<boolean> {
  const caller = await requirePerm("customers");
  if (!caller) return false;

  const isActive = formData.get("is_active") === "1";
  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  const rawDays = Number(String(formData.get("days_inactive") ?? "").replace(/\D/g, ""));
  const rawValue = String(formData.get("value") ?? "").replace(/[^\d.]/g, "");

  // القاعدة تفرض ٧–٣٦٥ بقيد check؛ نقصّه هنا أيضًا كي لا يرتدّ الحفظ بخطأ خام
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(365, Math.max(7, rawDays)) : 30;
  const value = rawValue === "" ? null : Math.min(100, Math.max(1, Number(rawValue)));

  // الحقول لا تُرسَل والمفتاح مطفأ (غير مركّبة في DOM) — فحفظ الإيقاف
  // بكامل الحمولة كان يمسح ضبط المالك ويرجعه للافتراضي. عند الإيقاف
  // نلمس is_active وحدها.
  const { error } = isActive
    ? await caller.supabase.from("winback_settings").upsert(
        {
          restaurant_id: caller.restaurantId,
          is_active: true,
          title: title || "اشتقنا لك — هدية عودة 🎁",
          value,
          value_kind: "percent",
          days_inactive: days,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "restaurant_id" },
      )
    : await caller.supabase.from("winback_settings").upsert(
        { restaurant_id: caller.restaurantId, is_active: false, updated_at: new Date().toISOString() },
        { onConflict: "restaurant_id" },
      );

  if (error) {
    console.error("[saveWinback]", error.message);
    return false;
  }

  revalidatePath("/dashboard/customers");
  return true;
}
