"use server";

import { revalidatePath } from "next/cache";
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

  await supabase.from("restaurant_features").upsert(
    {
      restaurant_id: restaurantId,
      module_key: moduleKey as ModuleKey,
      enabled,
      enabled_at: enabled ? new Date().toISOString() : null,
    },
    { onConflict: "restaurant_id,module_key" },
  );

  revalidatePath(`/admin/${restaurantId}`);
}
