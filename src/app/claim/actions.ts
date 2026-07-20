"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ClaimState = { error?: string };

export async function claimRestaurant(
  _prev: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "يجب تسجيل الدخول أولًا." };

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "أدخل رمز التسليم." };

  const { error } = await supabase.rpc("claim_restaurant", { p_code: code });

  if (error) {
    if (error.code === "P0002") {
      return { error: "الرمز غير صحيح أو مُستخدَم مسبقًا." };
    }
    if (error.code === "28000") {
      return { error: "يجب تسجيل الدخول أولًا." };
    }
    return { error: "تعذّرت المطالبة بالمطعم. حاول مرة أخرى." };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
