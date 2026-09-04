import { NextResponse } from "next/server";
import { guestWriter } from "@/lib/supabase/guest-writes";

export const dynamic = "force-dynamic";

/**
 * النبض — «هل نجح إنسانٌ في أخذ دوره؟»
 *
 * كلّ ما نرصده اليوم يقيس الأجزاء: الرئيسية ترجع ٢٠٠، والقاعدة تنبض،
 * والفحوص اليوميّة تقول إنّ الصلاحيات سليمة. ولا واحدٌ منها يقيس الرحلة.
 * وبينهما مسافةٌ كاملة: نشرةٌ مكسورة، أو مفتاح خدمةٍ سقط من البيئة، أو
 * حارس عنوانٍ اختلّ فصار يمنع الجميع — كلّها تُبقي الرئيسية ٢٠٠ والقاعدة
 * نابضة، والعميل واقفٌ على الباب لا يستطيع أخذ دوره.
 *
 * فهذا المسار يمشي الرحلة كاملةً كما يمشيها إنسان: ينضمّ، يقرأ تذكرته،
 * يُلغي. بنفس الكود الذي يستعمله العميل (`guestWriter` ثم الدوالّ نفسها)
 * — لا بنسخةٍ مبسّطة منه، وإلّا اختبرنا اختبارنا لا تطبيقنا.
 *
 * ويمرّ على مستأجرٍ صناعيّ (`is_canary`) مستثنًى من الدليل والبحث: صفٌّ
 * وهميّ كلّ ربع ساعة في طابور مطعمٍ حقيقيّ يجعل المضيف يرى أشباحًا.
 *
 * وسرٌّ لا لأنّ فيه ما يُخفى، بل لأنّ مسارًا يكتب في القاعدة بلا مفتاح
 * هو باب إغراقٍ مفتوح: مئة ألف نداءٍ تعني مئة ألف صفّ.
 */
type Step = { step: string; ms: number; ok: boolean; detail?: string };

export async function GET(req: Request) {
  const secret = process.env.CANARY_SECRET ?? "";
  if (!secret) {
    return NextResponse.json({ ok: false, error: "canary_not_configured" }, { status: 503 });
  }
  const given = req.headers.get("x-canary-key") ?? "";
  // مقارنةٌ بسيطة تكفي هنا: السرّ عشوائيّ طويل، ولا يُسرّب التوقيتُ منه
  // ما يُختصر به التخمين عمليًا عبر الشبكة.
  if (given !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const steps: Step[] = [];
  const t0 = Date.now();
  let entryId: string | null = null;

  try {
    const db = await guestWriter();

    // (١) أين يمرّ النبض
    let t = Date.now();
    const { data: branch, error: bErr } = await db
      .from("branches")
      .select("id, restaurants!inner(is_canary)")
      .eq("restaurants.is_canary", true)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    steps.push({ step: "branch", ms: Date.now() - t, ok: !bErr && Boolean(branch?.id), detail: bErr?.message });
    if (!branch?.id) throw new Error("no_canary_branch");

    // رقمٌ ثابت الشكل ومتغيّر الذيل: سقف القاعدة ثلاثةُ انضماماتٍ لكلّ
    // رقمٍ في عشر دقائق، والنبض كلّ ربع ساعة — فرقمٌ واحدٌ يكفي، لكنّ
    // تشغيلًا يدويًّا متتابعًا أثناء التشخيص كان سيصطدم بسقفه هو.
    const tail = String(Date.now() % 100_000).padStart(5, "0");
    const phone = `0590${tail}`;

    // (٢) الانضمام — المسار الكاتب كاملاً
    t = Date.now();
    const { data: joined, error: jErr } = await db.rpc("join_waitlist_guest", {
      p_branch_id: branch.id,
      p_full_name: "نبض دور",
      p_phone: phone,
      p_party_size: 1,
      p_zone: "",
    });
    const row = Array.isArray(joined) ? joined[0] : joined;
    entryId = row?.entry_id ?? null;
    steps.push({ step: "join", ms: Date.now() - t, ok: !jErr && Boolean(entryId), detail: jErr?.message });
    if (!entryId) throw new Error(jErr?.message ?? "join_returned_no_entry");

    // (٣) التذكرة — لا يكفي أن يُكتب الصفّ، يجب أن يراه صاحبه
    t = Date.now();
    const { data: st, error: sErr } = await db.rpc("waitlist_ticket_status", {
      p_entry_id: entryId,
      p_phone: phone,
    });
    const ticket = Array.isArray(st) ? st[0] : st;
    const sawTicket = !sErr && typeof ticket?.position === "number";
    steps.push({ step: "ticket", ms: Date.now() - t, ok: sawTicket, detail: sErr?.message });
    if (!sawTicket) throw new Error("ticket_unreadable");

    // (٤) الإلغاء — وهو أيضًا تنظيفُ ما أحدثناه: النبض لا يترك أثرًا
    t = Date.now();
    const { data: cancelled, error: cErr } = await db.rpc("cancel_waitlist_guest", {
      p_entry_id: entryId,
      p_phone: phone,
    });
    const didCancel = !cErr && cancelled === true;
    steps.push({ step: "cancel", ms: Date.now() - t, ok: didCancel, detail: cErr?.message });
    if (!didCancel) throw new Error("cancel_failed");

    return NextResponse.json(
      { ok: true, total_ms: Date.now() - t0, steps },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    // فشلَ النبض في منتصفه؟ لا نترك صفًّا حيًّا خلفنا. ومحاولةٌ واحدةٌ
    // صامتة: إن فشل التنظيف أيضًا فالكرون يُنهي الصفّ خلال ربع ساعة.
    console.error("[api/canary]", e instanceof Error ? e.message : e, "steps:", JSON.stringify(steps));
    if (entryId) {
      try {
        const db = await guestWriter();
        await db.from("waitlist_entries").update({ status: "expired" }).eq("id", entryId);
      } catch { /* الكرون يتكفّل */ }
    }
    return NextResponse.json(
      {
        ok: false,
        total_ms: Date.now() - t0,
        error: e instanceof Error ? e.message : "unknown",
        steps,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
