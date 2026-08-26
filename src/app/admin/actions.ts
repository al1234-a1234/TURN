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
  // تطبيعٌ قبل التحقّق لا بعده: النموذج يحوّل أي حرفٍ غير مسموح إلى شرطة
  // أثناء الكتابة، فمسافةٌ قبل الاسم أو بعده تصل هنا شرطةً في طرف المعرّف
  // — هكذا وُلد ‎/r/-pizza-peel-‎ فعليًّا. الشُّرَط المكرّرة تُدمج والطرفية تُقصّ.
  const slug = String(formData.get("slug") ?? "")
    .trim().toLowerCase().replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const branchName = String(formData.get("branch_name") ?? "").trim() || "الفرع الرئيسي";

  if (!name) return { error: "أدخل اسم المطعم." };
  if (!username || !/^[a-z0-9_.-]+$/.test(username))
    return { error: "اسم مستخدم صالح (أحرف إنجليزية وأرقام فقط)." };
  // الشكل القانوني الوحيد: مقاطع [a-z0-9] تفصلها شرطات مفردة — لا شرطة
  // طرفية ولا مكرّرة (التطبيع أعلاه ضمنها، والتحقّق يحرس أي مسارٍ آخر)
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
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

/**
 * مفتاح إيقاف المنصّة — الرافعة الوحيدة التي تُوقف الانضمام في كلّ مطعم.
 *
 * الحارس الحقيقي في القاعدة (مُطلِقٌ على الانضمام والحجز، 0094)، وهذا
 * الإجراء يسحبه فحسب. والقرار في القاعدة لا هنا عمدًا: نشرةٌ قديمة في
 * ذاكرة متصفّحٍ أو حافظةٍ على الحافة لا تستطيع تجاوز مُطلِقٍ في الجدول،
 * وتستطيع تجاوز شرطٍ في كود الصفحة.
 *
 * والإيقاف يمنع الدخول الجديد ولا يمنع التصريف: من في الطابور يُجلَس
 * ويُلغى كالمعتاد. وحبسُ مئةٍ واقفين على الأبواب بحجّة حمايتهم ليس حماية.
 */
export async function setPlatformPause(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/partners?redirect=/admin");

  const paused = String(formData.get("paused") ?? "") === "1";
  // السبب يُكتب في سجلّ التدقيق الذي لا يُعدَّل — ويُعرض للعميل حين يُوقَف
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);

  // لا نتحقّق من الصلاحية هنا: الدالّة نفسها ترفض غير مدير المنصّة
  // (‏42501). فحصٌ في الواجهة وفحصٌ في القاعدة يفترقان يومًا، والقاعدة
  // هي التي تُصدَّق.
  await supabase.rpc("set_platform_pause", { p_paused: paused, p_reason: reason || undefined });

  revalidatePath("/admin");
}

/**
 * حذف مطعم كامل — لا رجوع. الحارس الحقيقي داخل admin_delete_restaurant
 * نفسها (ترفض غير مدير المنصّة)، وهي أيضًا من تقرّر أيّ حساب موظّف/مالك
 * يُحذف معه (فقط إن لم يكن له وجودٌ في مطعمٍ آخر) — لا شيء من هذا هنا.
 */
export async function adminDeleteRestaurant(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/partners?redirect=/admin");

  const restaurantId = String(formData.get("restaurant_id") ?? "").trim();
  if (!restaurantId) return;

  await supabase.rpc("admin_delete_restaurant", { p_restaurant_id: restaurantId });
  revalidatePath("/admin");
}

/**
 * إخفاء/إظهار مطعم عن الاكتشاف العامّ (الرئيسية، البحث، صفحته نفسها) —
 * نفس عمود is_canary الذي يُخفي "نبض دور" اليوم. المطعم يبقى شغّالًا
 * بالكامل عبر رابطه المباشر /r/[slug]، فقط لا يظهر لزائرٍ يتصفّح عاديًّا.
 */
export async function adminToggleCanary(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/partners?redirect=/admin");

  const restaurantId = String(formData.get("restaurant_id") ?? "").trim();
  const canary = String(formData.get("canary") ?? "") === "1";
  if (!restaurantId) return;

  await supabase.rpc("admin_set_restaurant_canary", { p_restaurant_id: restaurantId, p_canary: canary });
  revalidatePath("/admin");
}
