"use server";

import { createClient } from "@/lib/supabase/server";

export type CounterReward = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  kind: string;
  title: string;
  value: number | null;
  value_kind: string | null;
  code: string | null;
  expires_at: string | null;
  created_at: string;
};

/** بحث الكاشير: رقم جوّال أو رمز هدية — يعيد الهدايا الفعّالة لمطعم المتصل فقط. */
export async function lookupRewards(query: string): Promise<CounterReward[]> {
  const q = (query ?? "").trim();
  if (!q) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_lookup_rewards", { p_query: q });
  if (error) return [];
  return (data ?? []) as CounterReward[];
}

/** اعتماد الهدية عند الكاشير — يقفلها نهائيًّا (لا صرف مزدوج، مضمون في القاعدة). */
export async function redeemAtCounter(rewardId: string): Promise<boolean> {
  if (!rewardId) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_redeem_reward", { p_reward_id: rewardId });
  return !error && data === true;
}
