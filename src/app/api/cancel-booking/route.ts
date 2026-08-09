import { NextResponse } from "next/server";
import { publicRead } from "@/lib/supabase/public-cache";
import { saudiMobile } from "@/lib/format";

/**
 * إلغاء حجزٍ بيد صاحبه — من خادمنا لا من متصفّحه.
 *
 * أخوات هذا المسار (api/my-status و api/my-rewards) وُجدت لأن كل نداء RPC
 * من متصفّحٍ إلى Supabase كان يرجع 405 بينما يرجع من خادمنا 200. والقراءة
 * حين تفشل تُظهر شاشةً فارغة؛ أمّا هذه فتفشل صامتةً: يضغط العميل «إلغاء»
 * فلا يحدث شيء، فيتركها ويغيب — وتبقى الطاولة محجوزةً لمن لن يأتي، وهي
 * خسارة المطعم لا خسارته وحده.
 *
 * ولا يُوسَّع شيء هنا: الدالّة نفسها تشترط تطابق الرقم مع صاحب الحجز،
 * وهي محدودة المعدّل في القاعدة. الخادم ناقلٌ لا حاكم.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { id?: unknown; phone?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const phone = saudiMobile(typeof body.phone === "string" ? body.phone : "");
  if (!id || !phone) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { data, error } = await publicRead().rpc("cancel_reservation_guest", { p_id: id, p_phone: phone });
  if (error) {
    console.error("[api/cancel-booking]", error.message);
    return NextResponse.json({ error: "cancel_failed" }, { status: 502 });
  }
  // ‏false تعني «ليس حجزك أو لا يقبل الإلغاء» — لا عطلًا، فالواجهة تفرّق
  return NextResponse.json({ ok: data === true });
}
