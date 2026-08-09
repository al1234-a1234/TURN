import { NextResponse } from "next/server";
import { guestWriter } from "@/lib/supabase/guest-writes";
import { saudiMobile } from "@/lib/format";

/**
 * «دوري وحجزي» — يمرّ من خادمنا لا من متصفّح العميل مباشرةً.
 *
 * السبب من السجلّ لا من التخمين: كل نداء RPC من متصفّح إلى Supabase كان
 * يرجع 405، وكلّ نداءٍ من خادمنا يرجع 200 — بنفس المفتاح ونفس المسار.
 * والعميل لا يرى من ذلك إلا شاشةً فارغة، فيظنّ دوره ضاع.
 *
 * ولم أثبت السبب في طبقة Supabase — فآثرتُ طريقًا مضمونًا على تشخيصٍ ناقص:
 * خادمُنا يستدعي الدالّة (وهو ما ثبت نجاحه)، والمتصفّح ينادي أصلَنا نفسه.
 * وهذا أمتن على كل حال: لا CORS، ولا مفتاح في الشبكة، والسجلّ عندنا.
 *
 * ولا سرّ يُكشف هنا: الدالّة نفسها متاحة للضيف، وهي محروسةٌ في القاعدة
 * بحدّ معدّلٍ على الرقم يمنع تعداد الأرقام بالتخمين.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("phone") ?? "";
  // نفس تطبيع مسار الانضمام: رقمٌ مشوّه يُرفض هنا فلا يصل القاعدة أصلًا
  const phone = saudiMobile(raw);
  if (!phone) return NextResponse.json({ rows: [] }, { status: 400 });

  const { data, error } = await (await guestWriter()).rpc("guest_status_by_phone", { p_phone: phone });
  if (error) {
    console.error("[api/my-status]", error.message);
    // ‏502 لا 200 بمصفوفةٍ فارغة: «لم نعرف» غير «ما عندك شيء»، والواجهة
    // تفرّق بينهما — تقول «تعذّر» بدل أن تُقنع صاحب الدور أن دوره زال.
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
  return NextResponse.json({ rows: data ?? [] });
}
