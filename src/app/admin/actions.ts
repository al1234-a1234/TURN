"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_RID_COOKIE } from "../dashboard/owner-context";

/** المشرف يفتح لوحة مطعم كاملة: نخزّن اختياره في كوكي ونحوّله للوحة. */
export async function openRestaurantDashboard(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/partners?redirect=/admin");
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  const rid = String(formData.get("restaurant_id") ?? "").trim();
  if (!rid) redirect("/admin");

  const store = await cookies();
  store.set(ADMIN_RID_COOKIE, rid, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/dashboard");
}

/** الخروج من وضع عرض المشرف (يمسح الكوكي ويرجع للأدمن). */
export async function exitAdminView() {
  const store = await cookies();
  store.delete(ADMIN_RID_COOKIE);
  redirect("/admin");
}

export type AdminCreateState = {
  error?: string;
  ok?: { username: string; code: string; phone: string; slug: string };
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

  // تحقّق أدمِن المنصّة محليًّا (دفاع في العمق فوق فحص الـ edge function)
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) return { error: "غير مصرّح — الأدمِن فقط." };

  // نحتاج رمز الوصول لتمريره للـ edge function
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "يجب تسجيل الدخول." };

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const branchName = String(formData.get("branch_name") ?? "").trim() || "الفرع الرئيسي";

  if (!name) return { error: "أدخل اسم المطعم." };
  if (!username || !/^[a-z0-9_.-]+$/.test(username))
    return { error: "اسم مستخدم صالح (أحرف إنجليزية وأرقام فقط)." };
  if (!slug || !/^[a-z0-9-]+$/.test(slug))
    return { error: "معرّف رابط صالح (أحرف إنجليزية صغيرة وأرقام وشُرَط)." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/provision-owner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ name, slug, username, phone, city, branch_name: branchName }),
    });
  } catch {
    return { error: "تعذّر الاتصال بالخادم. حاول مرة أخرى." };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === "username_taken") return { error: "اسم المستخدم مستخدم بالفعل." };
    if (data.error === "slug_taken") return { error: "معرّف الرابط مستخدم بالفعل." };
    if (data.error === "forbidden") return { error: "غير مصرّح — الأدمِن فقط." };
    return { error: "تعذّر إنشاء الحساب. تحقّق من البيانات وحاول مجددًا." };
  }

  revalidatePath("/admin");
  return { ok: { username: data.username, code: data.code, phone: data.phone ?? phone, slug: data.slug } };
}
