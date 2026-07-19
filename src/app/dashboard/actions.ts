"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateRestaurantState = { error?: string };

export async function createRestaurant(
  _prev: CreateRestaurantState,
  formData: FormData,
): Promise<CreateRestaurantState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "يجب تسجيل الدخول." };

  const name = String(formData.get("name") ?? "").trim();
  const nameEn = String(formData.get("name_en") ?? "").trim() || undefined;
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim() || undefined;
  const branchName = String(formData.get("branch_name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim() || undefined;
  const address = String(formData.get("address") ?? "").trim() || undefined;
  const timezone = String(formData.get("timezone") ?? "Asia/Riyadh");

  if (!name) return { error: "أدخل اسم المطعم." };
  if (!slug) return { error: "أدخل معرّف الرابط." };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return {
      error: "المعرّف: أحرف إنجليزية صغيرة وأرقام وشُرَط فقط (مثال: my-cafe).",
    };
  }
  if (!branchName) return { error: "أدخل اسم الفرع." };

  const { error } = await supabase.rpc("create_restaurant_with_branch", {
    p_name: name,
    p_slug: slug,
    p_branch_name: branchName,
    p_name_en: nameEn,
    p_phone: phone,
    p_city: city,
    p_address: address,
    p_timezone: timezone,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "معرّف الرابط مستخدم بالفعل، اختر معرّفًا آخر." };
    }
    if (error.code === "23514") {
      return { error: "معرّف الرابط غير صالح." };
    }
    if (error.code === "28000") {
      return { error: "يجب تسجيل الدخول." };
    }
    return { error: "تعذّر إنشاء المطعم. حاول مرة أخرى." };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
