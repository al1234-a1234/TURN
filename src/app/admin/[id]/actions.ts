"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MODULE_KEYS, type ModuleKey } from "@/lib/features";

/** الأدمن يفعّل/يطفّي موديولًا لمطعم. RLS يفرض is_platform_admin على restaurant_features. */
export async function setRestaurantFeature(
  restaurantId: string,
  moduleKey: string,
  enabled: boolean,
) {
  if (!restaurantId || !(MODULE_KEYS as readonly string[]).includes(moduleKey)) return;
  const supabase = await createClient();

  // بوّابة إضافية فوق RLS
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) return;

  const { error } = await supabase.from("restaurant_features").upsert(
    {
      restaurant_id: restaurantId,
      module_key: moduleKey as ModuleKey,
      enabled,
      enabled_at: enabled ? new Date().toISOString() : null,
    },
    { onConflict: "restaurant_id,module_key" },
  );

  // موديول يظنّه الأدمن مفعّلًا وهو مطفأ = مطعمٌ يدفع ولا يرى الميزة
  if (error) {
    console.error("[setRestaurantFeature]", error.message);
    return;
  }

  revalidatePath(`/admin/${restaurantId}`);
}

/**
 * فتح فرعٍ جديد — أدمن فقط منذ الآن.
 *
 * كانت هذي في `dashboard/manage/actions.ts` بحارسٍ وحيد: `caller.branchId`
 * (يمنع حسابًا مربوطًا بفرعٍ واحد، لا يمنع صاحب المطعم). فأنشأ حساب
 * Pizza peel نفسه ثمانية فروعٍ مكرّرة بضغطاتٍ متتالية على الزرّ — لا حدّ
 * معدّل، لا تأكيد، لا شيء يوقفه. راجع `ops/incidents/` للحادثة كاملة.
 *
 * فتح فرعٍ قرارٌ يمسّ الفوترة والتقارير على مستوى المنصّة، فصار هنا:
 * صفحةٌ أدمن تتحقّق من is_platform_admin أصلًا (page.tsx)، وهذا الفعل
 * يتحقّق ثانيةً — بوّابةٌ إضافية فوق RLS، لا اعتمادًا على أنّ الصفحة وحدها
 * كافية (نداءٌ مباشر للفعل يتجاوز الصفحة).
 */
export async function addBranchAdmin(restaurantId: string, formData: FormData) {
  if (!restaurantId) return;
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const city = String(formData.get("city") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;

  const { error } = await supabase
    .from("branches")
    .insert({ restaurant_id: restaurantId, name, city, address });

  if (error) {
    console.error("[addBranchAdmin]", error.message);
    return;
  }

  revalidatePath(`/admin/${restaurantId}`);
  revalidateTag("discovery");
}
