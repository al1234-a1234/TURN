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
  await caller.supabase
    .from("customer_restaurant")
    .update(update)
    .eq("restaurant_id", caller.restaurantId)
    .eq("customer_id", customerId);

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

  const { error: insErr } = await caller.supabase.from("customer_rewards").insert({
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

  revalidatePath(`/dashboard/customers/${customerId}`);
  return !insErr;
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
  await caller.supabase.rpc("grant_reward_to_segment", {
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

  revalidatePath("/dashboard/customers");
}

/** إلغاء مكافأة (تعليمها منتهية). */
export async function revokeReward(formData: FormData) {
  const caller = await requirePerm("customers");
  if (!caller) return;
  const rewardId = String(formData.get("reward_id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");
  if (!rewardId) return;
  await caller.supabase
    .from("customer_rewards")
    .update({ status: "expired" })
    .eq("id", rewardId)
    .eq("restaurant_id", caller.restaurantId);
  revalidatePath(`/dashboard/customers/${customerId}`);
}

/** اعتماد استخدام المكافأة من طرف الطاقم (العميل يقدّمها عند الطلب). */
export async function redeemReward(formData: FormData) {
  const caller = await requirePerm("customers");
  if (!caller) return;
  const rewardId = String(formData.get("reward_id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");
  if (!rewardId) return;
  await caller.supabase
    .from("customer_rewards")
    .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
    .eq("id", rewardId)
    .eq("restaurant_id", caller.restaurantId)
    .eq("status", "active");
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

  revalidatePath("/dashboard/customers");
  return !error;
}
