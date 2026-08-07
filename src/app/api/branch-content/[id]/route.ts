import { NextResponse } from "next/server";
import { getBranchContent } from "@/lib/supabase/public-cache";

/**
 * محتوى فرعٍ واحد (أقسام · أصناف · صور) لتبديل الفرع بلا إعادة توليد الصفحة.
 *
 * كان تبديل الفرع يستدعي `router.replace(?branch=…)` فيُعيد الخادم توليد
 * صفحة المطعم كاملة — وقراءة `searchParams` هي ما كانت تمنع توليدها مسبقًا،
 * أي أن كل مسحة باركود كانت تدفع ثمن ميزةٍ تُستعمل نادرًا. الآن الصفحة
 * تُولَّد مسبقًا بمنيو الفرع الأول، والتبديل وحده يمرّ من هنا.
 *
 * لا سرّ هنا: هذه بيانات عامة يراها كل من يفتح صفحة المطعم. والدالة تقرأ
 * بمفتاح المجهول خلف RLS كما تفعل الصفحة، وكاشها ٦٠ث هو نفسه.
 */
export const revalidate = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // معرّفٌ مشوّه يصل القاعدة كخطأ نصّي صاخب — نردّه هنا بهدوء
  if (!UUID.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  try {
    const content = await getBranchContent(id);
    return NextResponse.json(content, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    // الدالة ترمي عمدًا كي لا يُخزَّن «فرعٌ بلا قائمة» كذبًا — نردّ 503 فيعيد
    // المتصفّح المحاولة، ويبقى المعروض هو محتوى الفرع السابق لا فراغًا.
    console.error("[api/branch-content]", id, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
