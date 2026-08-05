"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "../guard";
import { STAFF_PERMISSIONS, type StaffPermission } from "@/lib/features";

export async function setStaffPermission(
  staffId: string,
  perm: StaffPermission,
  granted: boolean,
): Promise<boolean> {
  if (!staffId || !(STAFF_PERMISSIONS as readonly string[]).includes(perm)) return false;

  // حارس في طبقة التطبيق أيضًا لا في القاعدة وحدها: هذه الدالة الوحيدة في
  // المشروع التي تعدّل الصلاحيات، وكل إجراء «use server» نقطةُ HTTP عامّة
  // يستطيع أي أحد استدعاءها مباشرة. القاعدة ترمي 'not authorized' لغير المدير
  // — لكن طبقة واحدة لا تكفي لأخطر عملية عندنا.
  const caller = await requirePerm("team");
  if (!caller) return false;

  // set_staff_permission معرَّفة RETURNS void، فـ data تعود null دائمًا.
  // الفحص القديم (data !== true) كان يُرجع false حتى عند النجاح: تُكتب
  // الصلاحية في القاعدة فعلًا، ويُخبَر المالك أنها فشلت، ولا يُعاد التحميل —
  // فيظنّ المفتاح لم يُمنح وهو ممنوح. الحكم الصحيح هو غياب الخطأ وحده
  // (القاعدة ترفع استثناءً عند عدم التصريح فيظهر في error).
  const { error } = await caller.supabase.rpc("set_staff_permission", {
    p_staff_id: staffId,
    p_perm: perm,
    p_granted: granted,
  });
  if (error) return false;
  revalidatePath("/dashboard/staff");
  return true;
}
