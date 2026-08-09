import { NextResponse } from "next/server";
import { guestWriter } from "@/lib/supabase/guest-writes";
import { saudiMobile } from "@/lib/format";

/**
 * تسليح هديّة أو فكّها — من خادمنا لا من متصفّح العميل (انظر api/my-status).
 *
 * وهذه أحرج ما يُكسر صامتًا: العميل واقفٌ عند الكاشير يضغط «استعمال» ليراها
 * الاستقبال، فلا يحدث شيء ولا رسالة. حلقة الولاء كلّها — وهي ما يبيعه صاحب
 * المطعم لعميله — تنقطع في اللحظة الوحيدة التي تُرى فيها.
 *
 * والصرف يبقى بيد الموظّف وحده: هذا يسلّح لا غير، والقاعدة تشترط تطابق
 * الرقم مع صاحب الهديّة وتحدّ المعدّل.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { reward_id?: unknown; phone?: unknown; arm?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const rewardId = typeof body.reward_id === "string" ? body.reward_id : "";
  const phone = saudiMobile(typeof body.phone === "string" ? body.phone : "");
  if (!rewardId || !phone || typeof body.arm !== "boolean") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { data, error } = await (await guestWriter()).rpc("set_reward_armed_by_phone", {
    p_reward_id: rewardId,
    p_phone: phone,
    p_arm: body.arm,
  });
  if (error) {
    console.error("[api/arm-reward]", error.message);
    return NextResponse.json({ error: "arm_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: data === true });
}
