"use server";

import { createClient } from "@/lib/supabase/server";
import { saudiMobile } from "@/lib/format";

export type ClaimState = { ok: boolean; code?: string; title?: string; error?: string };

/** تفعيل عرض برقم الجوّال — يصدر رمزًا للكاشير ويسجّل الاستخدام (بحدود العرض). */
export async function claimOffer(offerId: string, phoneRaw: string): Promise<ClaimState> {
  const phone = saudiMobile(phoneRaw);
  if (!offerId || !phone) return { ok: false, error: "رقم الجوّال غير صحيح." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_offer", {
    p_offer_id: offerId,
    p_phone: phone,
  });
  if (error) return { ok: false, error: "تعذّر التفعيل — حاول مرة أخرى." };

  const r = (data ?? {}) as { ok?: boolean; error?: string; code?: string; title?: string };
  if (!r.ok) {
    const msgs: Record<string, string> = {
      already_claimed: "سبق أن فعّلت هذا العرض بهذا الرقم.",
      sold_out: "اكتمل عدد مرات هذا العرض.",
      new_customers_only: "هذا العرض للعملاء الجدد فقط.",
      offer_unavailable: "العرض غير متاح حاليًا.",
      rate_limited: "محاولات كثيرة اليوم — عد لاحقًا.",
      invalid_phone: "رقم الجوّال غير صحيح.",
    };
    return { ok: false, error: msgs[r.error ?? ""] ?? "تعذّر التفعيل." };
  }
  return { ok: true, code: r.code, title: r.title };
}
