"use server";

import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { requirePerm, callerBranchIds, resolveWriteBranch } from "../guard";
import { saudiMobile } from "@/lib/format";

type ResStatus = Database["public"]["Enums"]["reservation_status"];
const STATUSES: ResStatus[] = ["pending", "confirmed", "seated", "completed", "cancelled", "no_show"];

export type NewReservationState = {
  ok: boolean;
  /** اسم الطاولة التي عُيّنت — الموظّف يقولها للعميل فورًا */
  table?: string;
  error?: string;
};

/**
 * سبب الرفض يُقال، لا يُبتلع.
 *
 * كان الفشل يُطبع في السجلّ ثم تُعاد الصفحة كما هي، فيقرأ الموظّف غياب الحجز
 * «لم يُحفظ لسببٍ ما» — أو أسوأ: يظنّه حُفظ. رموز الحالة تأتي من
 * ‏book_reservation_guest، وكلٌّ منها له علاجٌ مختلف عند الموظّف.
 */
function reasonOf(code: string | undefined, fallback: string): string {
  switch (code) {
    case "P0006":
    case "P0007":
      return "لا توجد طاولة شاغرة في هذا الوقت — جرّب وقتًا آخر أو عددًا أقل.";
    case "P0001":
      return "هذا الفرع لا يستقبل حجوزات — فعّلها من الإعدادات.";
    case "P0002":
      return "الفرع غير متاح.";
    case "P0004":
      return "الموعد في الماضي.";
    case "P0005":
      return "الموعد أبعد من نافذة الحجز المسموحة — وسّعها من الإعدادات.";
    case "P0429":
      return "محاولات كثيرة على هذا الرقم — انتظر قليلًا ثم أعد المحاولة.";
    case "22023":
      return "الاسم والرقم مطلوبان.";
    case "P0008":
      return "هذا القسم غير متاح في هذا الفرع.";
    default:
      return fallback;
  }
}

export async function createReservation(
  _prev: NewReservationState,
  formData: FormData,
): Promise<NewReservationState> {
  const caller = await requirePerm("reservations");
  if (!caller) return { ok: false, error: "لا تملك صلاحية الحجوزات." };
  // الفرع المختار من المبدّل — حجز الفرع الثاني كان يُقيَّد على الفرع الأوّل
  const branchId = await resolveWriteBranch(caller, String(formData.get("branch_id") ?? ""));
  if (!branchId) return { ok: false, error: "لا يوجد فرع نشِط." };

  const name = String(formData.get("full_name") ?? "").trim();
  // تطبيع وتحقّق الرقم — نفس قاعدة العميل، وإلا تشظّى العميل الواحد من مسار الموظّف
  const phone = saudiMobile(String(formData.get("phone") ?? ""));
  const when = String(formData.get("reserved_at") ?? "").trim();
  if (!phone) return { ok: false, error: "الرقم يبدأ بـ 05 ويتكوّن من 10 خانات." };
  if (!when) return { ok: false, error: "اختر موعد الحجز." };
  const party = Math.max(1, Number(String(formData.get("party_size") ?? "2")) || 2);
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const zoneRaw = String(formData.get("zone") ?? "");
  // القاعدة تتحقّق منه بـ valid_branch_zone وترفض صراحةً (P0008) إن لم يصحّ.
  // قصّه هنا لاثنين كان يحوّل «عوائل» إلى «أيّ قسم» فيحجز في غير ما اختير.
  const zone = zoneRaw.trim() || undefined;

  // ‏book_reservation_guest لا create_reservation_guest: القديمة كانت تُنشئ
  // الحجز بـ table_id فارغ، فلا يحجز شيئًا ولا يمنع تعارضًا. هذه تختار أنسب
  // طاولةٍ شاغرة وتحجزها، وتردّ باسمها.
  const { data, error } = await caller.supabase.rpc("book_reservation_guest", {
    p_branch_id: branchId,
    p_full_name: name || "عميل",
    p_phone: phone,
    // datetime-local بلا منطقة زمنية — على خادم UTC كان يُفسَّر UTC فيُحفظ
    // الحجز متأخرًا ٣ ساعات. الرياض ثابتة +03:00 (بلا توقيت صيفي).
    p_reserved_at: new Date(`${when.length === 16 ? `${when}:00` : when}+03:00`).toISOString(),
    p_party_size: party,
    p_zone: zone,
    p_notes: notes,
  });
  // إعادة التحقّق بعد فشلٍ تُعيد قائمةً بلا الحجز الجديد فيُقرأ كأنه سُجّل،
  // والطاولة تبقى محجوزة في ذهن الموظّف وحده
  if (error) {
    console.error("[createReservation]", error.code, error.message);
    return { ok: false, error: reasonOf(error.code, "تعذّر حفظ الحجز — حاول مرة أخرى.") };
  }
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/dashboard/reservations");
  return { ok: true, table: (row as { table_label?: string } | null)?.table_label ?? undefined };
}

export async function setReservationStatus(id: string, status: ResStatus) {
  if (!id || !STATUSES.includes(status)) return;
  const caller = await requirePerm("reservations");
  if (!caller) return;
  const branchIds = await callerBranchIds(caller);
  if (branchIds.length === 0) return;
  const { error } = await caller.supabase
    .from("reservations")
    .update({ status })
    .eq("id", id)
    .in("branch_id", branchIds);
  if (error) {
    console.error("[setReservationStatus]", error.message);
    return;
  }
  revalidatePath("/dashboard/reservations");
  // «قادمون بحجز» يعيش في الاستقبال أيضًا — بلا هذا يبقى المُجلَس معروضًا
  // هناك، فيناديه المضيف مرّتين
  revalidatePath("/dashboard/reception");
}
