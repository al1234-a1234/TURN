"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { STAFF_PERMISSIONS, type StaffPermission } from "@/lib/features";

export async function setStaffPermission(
  staffId: string,
  perm: StaffPermission,
  granted: boolean,
) {
  if (!staffId || !(STAFF_PERMISSIONS as readonly string[]).includes(perm)) return;
  const supabase = await createClient();
  // الدالة تتحقّق أن المستدعي مدير المطعم
  await supabase.rpc("set_staff_permission", {
    p_staff_id: staffId,
    p_perm: perm,
    p_granted: granted,
  });
  revalidatePath("/dashboard/staff");
}
