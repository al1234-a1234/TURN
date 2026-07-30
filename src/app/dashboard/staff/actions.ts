"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { STAFF_PERMISSIONS, type StaffPermission } from "@/lib/features";

export async function setStaffPermission(
  staffId: string,
  perm: StaffPermission,
  granted: boolean,
): Promise<boolean> {
  if (!staffId || !(STAFF_PERMISSIONS as readonly string[]).includes(perm)) return false;
  const supabase = await createClient();
  // الدالة تتحقّق أن المستدعي مدير المطعم — ترجع false لغير المصرَّح،
  // وتجاهلها كان يترك المفتاح أخضر والصلاحية غير ممنوحة فعلًا
  const { data, error } = await supabase.rpc("set_staff_permission", {
    p_staff_id: staffId,
    p_perm: perm,
    p_granted: granted,
  });
  if (error || data !== true) return false;
  revalidatePath("/dashboard/staff");
  return true;
}
