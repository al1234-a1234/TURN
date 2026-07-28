"use server";

import { revalidatePath } from "next/cache";
import { requirePerm, resolveWriteBranch } from "../guard";

/**
 * حفظ قواعد المسح — «ماذا يفعل الباركود؟»
 * قسمان يتركّبان معًا: هدية الترحيب (أول مسح) والمكافأة الفورية (كل مسح).
 * كلٌّ منهما يُطفأ ويُشغَّل على حدة، والقوالب في الواجهة مجرّد تعبئة
 * للنموذج — لا شيء يُفعَّل إلا بضغطة «حفظ» من المالك نفسه.
 */
export async function saveCheckinSettings(formData: FormData) {
  const caller = await requirePerm("loyalty");
  if (!caller) return;

  const num = (k: string) => {
    const raw = String(formData.get(k) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
    return Number.isFinite(n) ? Math.max(0, n) : null;
  };
  const days = (k: string, fallback: number) => {
    const n = num(k);
    return Math.min(365, Math.max(1, n ?? fallback));
  };
  const kind = (k: string) => (String(formData.get(k) ?? "discount") === "gift" ? "gift" : "discount");
  const unit = (k: string) => (String(formData.get(k) ?? "percent") === "amount" ? "amount" : "percent");

  const welcome_kind = kind("welcome_kind");
  const instant_kind = kind("instant_kind");
  const welcome_value = num("welcome_value");
  const instant_value = num("instant_value");

  const branchId = await resolveWriteBranch(caller, formData.get("branch_id") as string);
  if (!branchId) return;

  await caller.supabase.from("checkin_settings").upsert({
    restaurant_id: caller.restaurantId,
    branch_id: branchId,
    welcome_enabled: formData.get("welcome_enabled") === "on",
    welcome_kind,
    welcome_title: String(formData.get("welcome_title") ?? "").trim() || "هدية ترحيب",
    welcome_value: welcome_kind === "discount" ? welcome_value : null,
    welcome_value_kind: unit("welcome_value_kind"),
    welcome_expires_days: days("welcome_expires_days", 14),
    instant_enabled: formData.get("instant_enabled") === "on",
    instant_kind,
    instant_title: String(formData.get("instant_title") ?? "").trim() || "خصم اليوم",
    instant_value: instant_kind === "discount" ? instant_value : null,
    instant_value_kind: unit("instant_value_kind"),
    instant_expires_days: days("instant_expires_days", 1),
    preset_key: String(formData.get("preset_key") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/dashboard/checkin");
}
