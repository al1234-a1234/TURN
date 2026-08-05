"use server";

import { requirePerm } from "../guard";

/*
 * صندوق الهدايا عند الكاشير.
 *
 * الحارس هنا «الطابور» لا «العملاء» عن قصد: قالب حساب الاستقبال الافتراضي
 * يمنح { waitlist: true } وحده، وصرف الهدية عند الحضور هو عمل الاستقبال نفسه —
 * فاشتراط صلاحية «العملاء» كان سيُعطّل صرف الهدايا في كل حساب استقبال.
 *
 * وكانت الدالّتان بلا أي حارس في طبقة التطبيق، تعتمدان على is_staff_of في
 * القاعدة وحدها. وكل دالة "use server" نقطة HTTP عامّة، فالحارس الصريح هنا
 * يجعل الصلاحية مقصودة لا مصادفة، ويضيف طبقة ثانية فوق القاعدة.
 */

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
  const caller = await requirePerm("waitlist");
  if (!caller) return [];
  const { data, error } = await caller.supabase.rpc("staff_lookup_rewards", { p_query: q });
  if (error) return [];
  return (data ?? []) as CounterReward[];
}

/** اعتماد الهدية عند الكاشير — يقفلها نهائيًّا (لا صرف مزدوج، مضمون في القاعدة). */
export async function redeemAtCounter(rewardId: string): Promise<boolean> {
  if (!rewardId) return false;
  const caller = await requirePerm("waitlist");
  if (!caller) return false;
  const { data, error } = await caller.supabase.rpc("staff_redeem_reward", { p_reward_id: rewardId });
  return !error && data === true;
}
