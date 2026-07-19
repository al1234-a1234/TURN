"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BookingState = {
  ok: boolean;
  error?: string;
  message?: string;
};

/**
 * تحويل وقت "جداري" (wall-clock) في منطقة زمنية معيّنة إلى لحظة UTC.
 * naive بصيغة "YYYY-MM-DDTHH:mm" (مخرجات datetime-local).
 * السعودية بلا توقيت صيفي فالتحويل دقيق.
 */
function zonedWallTimeToUtc(naive: string, timeZone: string): Date {
  const [datePart, timePart] = naive.split("T");
  if (!datePart || !timePart) return new Date(NaN);
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return new Date(NaN);

  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, 0);

  // احسب إزاحة المنطقة الزمنية عند هذه اللحظة
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcGuess));
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  const asZonedUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour === 24 ? 0 : map.hour,
    map.minute,
    map.second,
  );
  const offset = asZonedUtc - utcGuess;
  return new Date(utcGuess - offset);
}

export async function createReservation(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "يجب تسجيل الدخول أولاً لإتمام الحجز." };
  }

  const slug = String(formData.get("slug") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const partySize = Number(formData.get("party_size") ?? 0);
  const wall = String(formData.get("reserved_at") ?? "");
  const timeZone = String(formData.get("timezone") ?? "Asia/Riyadh");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!branchId) return { ok: false, error: "اختر الفرع." };
  if (!fullName) return { ok: false, error: "أدخل الاسم." };
  if (!phone) return { ok: false, error: "أدخل رقم الجوّال." };
  if (!Number.isInteger(partySize) || partySize < 1) {
    return { ok: false, error: "عدد الأشخاص غير صحيح." };
  }
  if (!wall) return { ok: false, error: "اختر تاريخ ووقت الحجز." };

  const reservedAt = zonedWallTimeToUtc(wall, timeZone);
  if (Number.isNaN(reservedAt.getTime())) {
    return { ok: false, error: "صيغة الوقت غير صحيحة." };
  }
  if (reservedAt.getTime() < Date.now()) {
    return { ok: false, error: "لا يمكن الحجز في وقت ماضٍ." };
  }

  // احترام إعدادات الفرع (إن وُجدت)، وإلا قيم افتراضية معقولة
  const { data: settings } = await supabase
    .from("branch_settings")
    .select(
      "accepts_reservations, max_party_size, default_duration_min, booking_window_days",
    )
    .eq("branch_id", branchId)
    .maybeSingle();

  if (settings && settings.accepts_reservations === false) {
    return { ok: false, error: "هذا الفرع لا يستقبل حجوزات حاليًا." };
  }
  const maxParty = settings?.max_party_size ?? 20;
  if (partySize > maxParty) {
    return { ok: false, error: `الحد الأقصى ${maxParty} أشخاص للحجز.` };
  }
  const duration = settings?.default_duration_min ?? 90;
  const windowDays = settings?.booking_window_days ?? 30;
  if (reservedAt.getTime() > Date.now() + windowDays * 86_400_000) {
    return { ok: false, error: `يمكن الحجز خلال ${windowDays} يومًا كحد أقصى.` };
  }

  // إيجاد/إنشاء ملف العميل المرتبط بالمستخدم
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
    if (cErr || !created) {
      return { ok: false, error: "تعذّر إنشاء ملف العميل." };
    }
    customerId = created.id;
  } else {
    await supabase
      .from("customers")
      .update({ full_name: fullName, phone })
      .eq("id", customerId);
  }

  // إنشاء الحجز (time_range يُملأ تلقائيًا عبر trigger)
  const { error: rErr } = await supabase.from("reservations").insert({
    branch_id: branchId,
    customer_id: customerId,
    party_size: partySize,
    reserved_at: reservedAt.toISOString(),
    duration_min: duration,
    notes,
  });

  if (rErr) {
    return {
      ok: false,
      error: "تعذّر إتمام الحجز. جرّب وقتًا آخر أو حاول لاحقًا.",
    };
  }

  if (slug) revalidatePath(`/r/${slug}`);
  return {
    ok: true,
    message: "تم استلام طلب حجزك! ستصلك رسالة التأكيد قريبًا.",
  };
}
