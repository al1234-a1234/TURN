"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AdminCreateState = {
  error?: string;
  ok?: { slug: string; claim_code: string | null; linked: boolean };
};

export async function adminCreateRestaurant(
  _prev: AdminCreateState,
  formData: FormData,
): Promise<AdminCreateState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "يجب تسجيل الدخول." };

  const name = String(formData.get("name") ?? "").trim();
  const nameEn = String(formData.get("name_en") ?? "").trim() || undefined;
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const branchName = String(formData.get("branch_name") ?? "").trim() || "الفرع الرئيسي";
  const ownerEmail = String(formData.get("owner_email") ?? "").trim() || undefined;
  const city = String(formData.get("city") ?? "").trim() || undefined;

  if (!name) return { error: "أدخل اسم المطعم." };
  if (!slug) return { error: "أدخل معرّف الرابط." };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: "المعرّف: أحرف إنجليزية صغيرة وأرقام وشُرَط فقط." };
  }

  const { data, error } = await supabase.rpc("admin_create_restaurant", {
    p_name: name,
    p_slug: slug,
    p_branch_name: branchName,
    p_name_en: nameEn,
    p_owner_email: ownerEmail,
    p_city: city,
  });

  if (error) {
    if (error.code === "23505") return { error: "معرّف الرابط مستخدم بالفعل." };
    if (error.code === "42501") return { error: "غير مصرّح — الأدمِن فقط." };
    return { error: "تعذّر إنشاء المطعم. حاول مرة أخرى." };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const claimCode: string | null = row?.claim_code ?? null;

  revalidatePath("/admin");
  return {
    ok: { slug, claim_code: claimCode, linked: claimCode === null },
  };
}
