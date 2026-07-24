"use server";

import { createClient } from "@/lib/supabase/server";

export type Gift = {
  id?: string;
  title: string;
  kind: string;
  value: number | null;
  value_kind: string;
  expires_days?: number;
};

export type CheckinState = {
  ok: boolean;
  error?: string;
  phone?: string;
  restaurant?: { name: string; logo_url: string | null; slug: string };
  is_first_visit?: boolean;
  is_recent?: boolean;
  visits?: number;
  points?: number;
  loyalty?: { points_per_visit: number; threshold: number } | null;
  gift?: Gift | null;
  loyalty_reward?: { title: string } | null;
};

// امسح خذ هديتك: رقم (+ اسم أول مرة) → تسجيل زيارة + هدية ترحيب + نقاط ولاء
export async function checkinAction(_prev: CheckinState, formData: FormData): Promise<CheckinState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!slug) return { ok: false, error: "رابط غير صالح." };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return { ok: false, error: "اكتب رقم جوّالك كامل." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_checkin", {
    p_slug: slug,
    p_phone: phone,
    p_name: name || undefined,
  });

  if (error) return { ok: false, error: "تعذّر التسجيل، حاول مرة أخرى." };

  const r = (data ?? {}) as Record<string, unknown>;
  if (!r.ok) {
    const code = String(r.error ?? "");
    if (code === "invalid_phone") return { ok: false, error: "رقم الجوّال غير صحيح." };
    if (code === "restaurant_not_found") return { ok: false, error: "المطعم غير متاح حاليًا." };
    return { ok: false, error: "تعذّر التسجيل، حاول مرة أخرى." };
  }

  return {
    ok: true,
    phone: (r.phone as string) ?? phone,
    restaurant: r.restaurant as CheckinState["restaurant"],
    is_first_visit: Boolean(r.is_first_visit),
    is_recent: Boolean(r.is_recent),
    visits: Number(r.visits ?? 0),
    points: Number(r.points ?? 0),
    loyalty: (r.loyalty as CheckinState["loyalty"]) ?? null,
    gift: (r.gift as Gift | null) ?? null,
    loyalty_reward: (r.loyalty_reward as { title: string } | null) ?? null,
  };
}
