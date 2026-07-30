"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProvisionState = {
  ok?: { username: string; code: string; name?: string };
  error?: string;
};

/**
 * إنشاء حساب موظّف (استقبال غالبًا) — يستدعيه **مالك المطعم** من لوحته.
 * قبلها كان يتطلّب SQL يدويًّا من إدارة المنصّة، فيستحيل استضافة عشرات المطاعم.
 * الصلاحية تُتحقَّق داخل الـ edge function بمفتاح الخدمة (لا نثق بأي معرّف يُرسَل).
 */
export async function createStaffAccount(
  _prev: ProvisionState,
  formData: FormData,
): Promise<ProvisionState> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "يجب تسجيل الدخول." };

  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const restaurantId = String(formData.get("restaurant_id") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  const preset = String(formData.get("preset") ?? "reception");

  if (!username || !/^[a-z0-9_.-]+$/.test(username)) {
    return { error: "اسم مستخدم صالح: أحرف إنجليزية صغيرة وأرقام فقط (مثال: eficto-rec)." };
  }

  // قوالب جاهزة بدل ترك المالك يخمّن الصلاحيات
  const permissions =
    preset === "manager"
      ? { waitlist: true, reservations: true, customers: true, loyalty: true, reviews: true, analytics: true }
      : preset === "reception_plus"
        ? { waitlist: true, reservations: true, customers: true }
        : { waitlist: true };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/provision-staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "create",
        restaurant_id: restaurantId,
        branch_id: branchId || null,
        username,
        name,
        permissions,
      }),
    });
  } catch {
    return { error: "تعذّر الاتصال بالخادم. حاول مرة أخرى." };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === "username_taken") return { error: "اسم المستخدم مستخدم بالفعل — جرّب غيره." };
    if (data.error === "forbidden") return { error: "غير مصرّح — المالك أو المدير فقط." };
    if (data.error === "bad_branch") return { error: "الفرع غير صالح." };
    if (data.error === "forbidden_branch") return { error: "لا تملك صلاحية على هذا الفرع — أنشئ الحساب في فرعك." };
    if (data.error === "forbidden_owner") return { error: "حساب المالك يُعاد ضبطه من إدارة المنصّة فقط." };
    return { error: "تعذّر إنشاء الحساب. تحقّق من البيانات وحاول مجددًا." };
  }

  revalidatePath("/dashboard/staff");
  return { ok: { username: data.username, code: data.code, name: data.name } };
}

/** إعادة ضبط رمز موظّف نسي رمزه — بلا تدخّل من إدارة المنصّة. */
export async function resetStaffCode(
  _prev: ProvisionState,
  formData: FormData,
): Promise<ProvisionState> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "يجب تسجيل الدخول." };

  const staffId = String(formData.get("staff_id") ?? "");
  if (!staffId) return { error: "حدّد الموظّف." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/provision-staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: "reset", staff_id: staffId }),
    });
  } catch {
    return { error: "تعذّر الاتصال بالخادم." };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === "forbidden_owner") return { error: "رمز المالك يُعاد ضبطه من إدارة دور فقط." };
    if (data.error === "forbidden") return { error: "غير مصرّح." };
    return { error: "تعذّرت إعادة الضبط." };
  }

  revalidatePath("/dashboard/staff");
  return { ok: { username: data.username, code: data.code } };
}
