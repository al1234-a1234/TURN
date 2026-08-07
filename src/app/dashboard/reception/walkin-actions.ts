"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";
import { saudiMobile } from "@/lib/format";

export type WalkInState = { ok: boolean; error?: string };

/** إضافة عميل حاضر (walk-in) للطابور من الاستقبال. */
export async function addWalkIn(_prev: WalkInState, formData: FormData): Promise<WalkInState> {
  // إضافة للطابور = صلاحية «الطابور»
  const caller = await requirePerm("waitlist");
  if (!caller) return { ok: false, error: "لا تملك صلاحية الطابور." };
  const supabase = caller.supabase;

  // الفرع المختار في الاستقبال — لا بد أن يكون تابعًا لمطعم صاحب الصلاحية (منع الخلط بين الفروع/المطاعم).
  // وحساب مربوط بفرع لا يضيف إلا لفرعه (عزل الفرانشايز).
  const submittedBranch = caller.branchId ?? String(formData.get("branch_id") ?? "").trim();
  const branchQuery = supabase
    .from("branches").select("id").eq("restaurant_id", caller.restaurantId).eq("is_active", true);
  const { data: branch } = submittedBranch
    ? await branchQuery.eq("id", submittedBranch).maybeSingle()
    : await branchQuery.order("created_at").limit(1).maybeSingle();
  if (!branch) return { ok: false, error: "الفرع غير متاح." };

  const name = String(formData.get("full_name") ?? "").trim() || "ضيف";
  // تطبيع وتحقّق الرقم — نفس قاعدة العميل، وإلا تشظّى العميل الواحد من مسار الموظّف
  const phone = saudiMobile(String(formData.get("phone") ?? ""));
  if (!phone) return { ok: false, error: "رقم الجوّال غير صحيح — يبدأ بـ 05 ويتكوّن من 10 خانات." };
  const party = Math.max(1, Number(String(formData.get("party_size") ?? "2")) || 2);
  // القسم كما اختاره المضيف — الحارس في القاعدة يتحقّق أنه يخصّ الفرع
  // ويقصّه لأوّل قسمٍ فعّال إن لم يكن. قصّه هنا لاثنين كان يضع من اختار
  // «عوائل» في «داخلي».
  const zone = String(formData.get("zone") ?? "").trim() || undefined;

  // دالة الموظّف لا دالة الضيف: تتجاوز «مغلق يدويًا/خارج الدوام» عمدًا —
  // إقفال الانضمام الإلكتروني ما يمنع المضيف من إضافة الواقف على الباب.
  const { error } = await supabase.rpc("staff_add_walkin", {
    p_branch_id: branch.id,
    p_full_name: name,
    p_phone: phone,
    p_party_size: party,
    p_zone: zone,
  });
  if (error) return { ok: false, error: "تعذّرت الإضافة — حاول مرة أخرى." };

  revalidatePath("/dashboard/reception");
  return { ok: true };
}
