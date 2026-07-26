"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/format";
import { pushRankUpdatesAfterSelfCancel } from "@/lib/push";

export type WaitlistState = {
  ok: boolean;
  error?: string;
  position?: number;
  total?: number;
  entryId?: string;
  phone?: string;
};

// انضمام الضيف: اسم + رقم فقط، بدون تسجيل دخول
export async function joinWaitlistGuest(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const supabase = await createClient();

  const slug = String(formData.get("slug") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  // تطبيع الرقم (عربي/فارسي → لاتيني، وإزالة الفواصل) قبل أي حفظ أو مطابقة
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const zoneRaw = String(formData.get("zone") ?? "inside");
  const zone = zoneRaw === "outside" ? "outside" : "inside";

  if (!branchId) return { ok: false, error: "اختر الفرع." };
  if (!fullName) return { ok: false, error: "اكتب اسمك." };
  if (!phone) return { ok: false, error: "اكتب رقم جوّالك." };

  const { data, error } = await supabase.rpc("join_waitlist_guest", {
    p_branch_id: branchId,
    p_full_name: fullName,
    p_phone: phone,
    p_party_size: 1,
    p_zone: zone,
  });

  if (error) {
    if (error.code === "P0001") {
      return { ok: false, error: "هذا الفرع لا يستقبل قائمة انتظار حاليًا." };
    }
    if (error.code === "P0002") return { ok: false, error: "الفرع غير متاح." };
    return { ok: false, error: "تعذّر الانضمام. حاول مرة أخرى." };
  }

  const row = Array.isArray(data) ? data[0] : data;

  // العدد الحالي في الطابور (لحساب حلقة التقدّم)
  const { data: counts } = await supabase.rpc("waitlist_counts", { b_id: branchId });
  const c = Array.isArray(counts) ? counts[0] : counts;

  if (slug) revalidatePath(`/r/${slug}`);
  return {
    ok: true,
    position: row?.queue_pos ?? undefined,
    total: c?.total ?? undefined,
    entryId: row?.entry_id ?? undefined,
    phone,
  };
}

/** حفظ اشتراك إشعارات الدفع للعميل (يُتحقّق من الصف + الرقم داخل الدالة). */
export async function savePushSubscription(
  entryId: string,
  phone: string,
  sub: { endpoint: string; p256dh: string; auth: string },
): Promise<boolean> {
  if (!entryId || !phone || !sub?.endpoint) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_push_subscription", {
    p_entry_id: entryId,
    p_phone: phone,
    p_endpoint: sub.endpoint,
    p_p256dh: sub.p256dh,
    p_auth: sub.auth,
  });
  return !error && data === true;
}

export async function cancelWaitlistGuest(entryId: string, phone: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_waitlist_guest", {
    p_entry_id: entryId,
    p_phone: phone,
  });
  const ok = !error && data === true;

  // من كان خلف المُلغي تقدّم دوره — أشعِرهم (كان هذا المسار صامتًا)
  if (ok) await pushRankUpdatesAfterSelfCancel(supabase, entryId, phone);

  return ok;
}

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
