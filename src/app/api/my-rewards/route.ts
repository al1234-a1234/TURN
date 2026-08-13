import { NextResponse } from "next/server";
import { guestWriter } from "@/lib/supabase/guest-writes";
import { saudiMobile } from "@/lib/format";

/**
 * هدايا العميل بالرقم — من خادمنا لا من متصفّحه (انظر api/my-status).
 *
 * وهذه كانت معطوبةً منذ زمنٍ بلا أن يشتكي أحد: السجلّ يُظهر 405 لكل نداء
 * ‏rewards_by_phone من متصفّح. فبطاقة الهدايا تبدو «فارغة» دائمًا، ويقرؤها
 * العميل «ما عندي هدايا» — وهي حلقة القيمة التي يبيعها صاحب المطعم.
 */
export const dynamic = "force-dynamic";

/**
 * عنوان الطالب — أوّل قيمة في `x-forwarded-for` (وهي التي وضعها وكيلنا).
 * وغيابه يُعامَل طالبًا مجهولًا واحدًا مشتركًا (الأشدّ) لا طالبًا جديدًا لكل
 * طلب: ولو عاملناه بالثانية لصار كتمُ الترويسة أسهل طريقٍ لتعطيل الحدّ.
 */
function callerIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "";
}


export async function GET(req: Request) {
  const phone = saudiMobile(new URL(req.url).searchParams.get("phone") ?? "");
  if (!phone) return NextResponse.json({ rows: [] }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const { data, error } = await (await guestWriter()).rpc("rewards_by_phone", { p_phone: phone, p_ip: callerIp(req) });
  if (error) {
    console.error("[api/my-rewards]", error.message);
    return NextResponse.json({ error: "lookup_failed" }, { status: 502 });
  }
  return NextResponse.json({ rows: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
