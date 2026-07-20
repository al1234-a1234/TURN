"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type WaitlistState = {
  ok: boolean;
  error?: string;
  position?: number;
};

const ZONES = ["any", "inside", "outside"];

export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "سجّل الدخول أولاً للانضمام إلى قائمة الانتظار." };
  }

  const slug = String(formData.get("slug") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const partySize = Number(formData.get("party_size") ?? 0);
  const zone = String(formData.get("zone") ?? "any");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!branchId) return { ok: false, error: "اختر الفرع." };
  if (!fullName) return { ok: false, error: "أدخل الاسم." };
  if (!phone) return { ok: false, error: "أدخل رقم الجوّال." };
  if (!Number.isInteger(partySize) || partySize < 1) {
    return { ok: false, error: "اختر عدد الكراسي." };
  }
  if (!ZONES.includes(zone)) return { ok: false, error: "اختر المنطقة." };

  const { data: settings } = await supabase
    .from("branch_settings")
    .select("accepts_waitlist, max_party_size")
    .eq("branch_id", branchId)
    .maybeSingle();

  if (settings && settings.accepts_waitlist === false) {
    return { ok: false, error: "هذا الفرع لا يستقبل قائمة انتظار حاليًا." };
  }
  const maxParty = settings?.max_party_size ?? 20;
  if (partySize > maxParty) {
    return { ok: false, error: `الحد الأقصى ${maxParty} أشخاص.` };
  }

  // إيجاد/إنشاء ملف العميل
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = existing?.id;
  if (!customerId) {
    const { data: created, error: cErr } = await supabase
      .from("customers")
      .insert({ user_id: user.id, full_name: fullName, phone })
      .select("id")
      .single();
    if (cErr || !created) return { ok: false, error: "تعذّر إنشاء ملف العميل." };
    customerId = created.id;
  } else {
    await supabase
      .from("customers")
      .update({ full_name: fullName, phone })
      .eq("id", customerId);
  }

  // الانضمام (الترتيب position يُحسب تلقائيًا عبر trigger)
  const { data: entry, error: wErr } = await supabase
    .from("waitlist_entries")
    .insert({ branch_id: branchId, customer_id: customerId, party_size: partySize, zone, notes })
    .select("position")
    .single();

  if (wErr || !entry) {
    return { ok: false, error: "تعذّر الانضمام للطابور. حاول مرة أخرى." };
  }

  if (slug) revalidatePath(`/r/${slug}`);
  return { ok: true, position: entry.position ?? undefined };
}
