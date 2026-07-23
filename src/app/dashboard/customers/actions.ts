"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";
import type { TablesUpdate } from "@/lib/supabase/database.types";

const TIERS = ["regular", "silver", "gold"];

export async function updateCustomerProfile(
  customerId: string,
  patch: { is_vip?: boolean; tier?: string; note?: string | null; is_blocked?: boolean },
) {
  const caller = await requirePerm("customers");
  if (!caller || !customerId) return;

  const update: TablesUpdate<"customer_restaurant"> = {};
  if (patch.is_vip !== undefined) update.is_vip = patch.is_vip;
  if (patch.is_blocked !== undefined) update.is_blocked = patch.is_blocked;
  if (patch.tier !== undefined && TIERS.includes(patch.tier)) update.tier = patch.tier;
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

/** منح العميل هديّة أو خصم (أداة تسويق/جذب) — يظهر للعميل عبر رقمه. */
export async function grantReward(formData: FormData) {
  const caller = await requirePerm("customers");
  if (!caller) return;

  const customerId = String(formData.get("customer_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!customerId || !title) return;

  // تأكيد أن العميل ينتمي لهذا المطعم (لا مكافآت لعملاء لم يزوروه)
  const { data: member } = await caller.supabase
    .from("customer_restaurant")
    .select("customer_id")
    .eq("restaurant_id", caller.restaurantId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (!member) return;

  const kind = String(formData.get("kind") ?? "gift") === "discount" ? "discount" : "gift";
  const valueRaw = String(formData.get("value") ?? "").trim();
  const value = valueRaw ? Number(valueRaw) : null;
  const valueKind = String(formData.get("value_kind") ?? "percent") === "amount" ? "amount" : "percent";
  const description = String(formData.get("description") ?? "").trim() || null;
  const code = String(formData.get("code") ?? "").trim().toUpperCase() || null;
  const daysRaw = String(formData.get("expires_days") ?? "").trim();
  const days = daysRaw ? Math.max(1, Number(daysRaw)) : null;
  const expires_at = days ? new Date(Date.now() + days * 864e5).toISOString() : null;

  await caller.supabase.from("customer_rewards").insert({
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
}

/** منح مكافأة لشريحة كاملة (الكل/VIP/ذهبي/فضّي/عائدون) — حملة تسويقية. */
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
    p_value: value,
    p_value_kind: valueKind,
    p_description: description,
    p_code: code,
    p_expires_at: expires_at,
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
