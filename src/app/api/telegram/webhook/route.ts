import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * أذن البوت — الطرف الذي يجعله ذا اتجاهين.
 *
 * البوت اليوم يتكلّم ولا يسمع. وهذا المسار يجعل المالك يكتب «الآن» أو
 * «اقفل بيتزا» من جوّاله في تلغرام فينفَّذ — بلا لوحة، بلا تسجيل دخول،
 * وبلا أن يكون على شبكة المطعم. وهو ما يحوّل البوت من ناقوسٍ إلى أداة.
 *
 * ثلاثة أقفال، وكلٌّ منها يسدّ ثغرةً مختلفة — لا تُسقط أيًّا منها:
 *
 *   ١) سرّ الترويسة (`X-Telegram-Bot-Api-Secret-Token`): يُضبط عند تسجيل
 *      الـwebhook، ولا يعرفه إلا تلغرام وخادمنا. عنوان هذا المسار عامّ
 *      كأيّ مسار، فبلا هذا السرّ يستطيع أيّ أحدٍ في الأرض أن ينتحل تلغرام
 *      ويأمر البوت — أي أن يقفل مطاعم الناس بطلبٍ واحد.
 *
 *   ٢) هويّة المُرسِل (`chat.id`): حتى لو تسرّب السرّ يومًا، الأوامر لا
 *      تُنفَّذ إلا لمحادثة المالك المسجَّلة في `alert_config`. وهذا يمنع
 *      أيضًا الحالة البلهاء: أن يضيف أحدهم البوت إلى مجموعةٍ فيصير كلّ
 *      من فيها قادرًا على إقفال الفروع.
 *
 *   ٣) الصلاحية في القاعدة: `telegram_command` مسحوبةٌ من anon و
 *      authenticated سحبًا، ويحرسها فحصٌ في شبكة الفحوص
 *      (`w20_telegram_cmd_locked`). فلو سقط القفلان أعلاه، تبقى الدالّة
 *      نفسها غير قابلةٍ للنداء إلا بمفتاح الخدمة.
 *
 * ولماذا مفتاح الخدمة هنا أصلًا؟ لأن الأمر يعبر المستأجرين (يقرأ كل
 * المطاعم ويكتب في إعداداتها) بلا جلسة مستخدم — فلا يوجد «عميل مستدعٍ»
 * يحكمه RLS. والمنفذ واحدٌ ضيّق: نداءُ دالّةٍ واحدةٍ لا غير.
 *
 * ونردّ 200 دائمًا لتلغرام (حتى عند الرفض): أيّ رمزٍ آخر يجعله يعيد
 * المحاولة مرارًا بنفس التحديث، فيتحوّل خطأٌ عابرٌ إلى طوفان.
 */

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
};

const TELEGRAM_API = "https://api.telegram.org";

/** يقصّ «/» و«@BotName» ويفصل الأمر عن بقيّته. */
function parse(text: string): { cmd: string; arg: string } {
  const trimmed = text.trim().replace(/^\//, "");
  const spaceAt = trimmed.search(/\s/);
  const rawCmd = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt);
  const arg = spaceAt === -1 ? "" : trimmed.slice(spaceAt + 1).trim();
  return { cmd: rawCmd.split("@")[0].toLowerCase(), arg };
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!secret || !token) {
    // غير مُهيّأ: لا نكشف السبب لمن يطرق، ولا نعامله كخطأ عندنا.
    return NextResponse.json({ ok: true });
  }

  // (١) السرّ
  if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: true });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text;
  if (!chatId || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ ok: true });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: true });

  const { cmd, arg } = parse(text);

  // زرّ «لا الآن» — ردٌّ محايدٌ بلا أيّ نداءٍ للقاعدة. لا قرارًا معلّقًا
  // يُسجَّل، فالصمت هنا هو الأصل: لم يتغيّر شيء.
  if (text.trim() === "لا الآن") {
    try {
      await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "تمام، لم يتغيّر شيء.",
          reply_markup: { remove_keyboard: true },
        }),
      });
    } catch {
      /* فشل الردّ لا يُعاد */
    }
    return NextResponse.json({ ok: true });
  }

  // زرّ «طبّق الاثنين» — قفل صلاحية إنشاء الفروع + حذف الفروع المكرّرة.
  // دالّةٌ مستقلّة (0158) تتحقّق من هويّة المُرسِل بنفسها بنفس نمط
  // telegram_command أدناه، فلا مسارٌ آخر لتنفيذها.
  if (text.trim() === "طبّق الاثنين") {
    const { data: applyReply, error: applyError } = await db.rpc(
      "telegram_apply_branch_lockdown_cleanup",
      { p_chat_id: String(chatId) },
    );
    if (!applyError && applyReply === null) {
      return NextResponse.json({ ok: true });
    }
    const applyBody =
      applyError || typeof applyReply !== "string"
        ? "⚠️ تعذّر التنفيذ: " + (applyError?.message ?? "خطأ غير معروف")
        : applyReply;
    try {
      await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: applyBody,
          reply_markup: { remove_keyboard: true },
        }),
      });
    } catch {
      /* فشل الردّ لا يُعاد */
    }
    return NextResponse.json({ ok: true });
  }

  // (٢) و(٣) في نداءٍ واحد: القاعدة تتحقّق من هويّة المُرسِل بنفسها ثم
  // تُنفّذ وتصوغ الردّ. وتُرجع NULL لغير المالك — فلا نردّ على الغريب أصلًا،
  // ولا يعرف من طرق البابَ أهو موجودٌ أم لا.
  const { data: reply, error } = await db.rpc("telegram_command", {
    p_chat_id: String(chatId),
    p_cmd: cmd,
    p_arg: arg,
  });

  if (!error && reply === null) {
    return NextResponse.json({ ok: true });
  }

  const body =
    error || typeof reply !== "string"
      ? "⚠️ تعذّر تنفيذ الأمر. جرّب /مساعدة"
      : reply;

  try {
    await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: body }),
    });
  } catch {
    // فشل الردّ لا يُعاد: تلغرام سيعيد إرسال التحديث لو أرجعنا خطأ.
  }

  return NextResponse.json({ ok: true });
}
