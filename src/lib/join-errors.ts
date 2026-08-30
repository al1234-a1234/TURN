/**
 * رسائل رفض الانضمام — مصدرٌ واحد، وقابلٌ للاختبار.
 *
 * ── العطب الذي وُلدت منه ──
 * `join_waitlist_guest` ترفع **سبعة** رموز. والإجراء كان يعالج خمسةً منها،
 * ويسقط الباقيَين في «تعذّر الانضمام. حاول مرة أخرى» — جملةٌ لا تقول للعميل
 * الواقف على باب المطعم شيئًا، ولا تقول لنا نحن شيئًا حين يشتكي.
 *
 * والمفقودان ليسا نادرين:
 *   P0011 — الطابور موقوف. وهو الميزة التي شُغّلت أمسِ، فصار الافتراض في كلّ
 *           فرعٍ جديد. أي: أكثرُ سببِ رفضٍ متوقَّعٍ اليوم، وأعمُّ رسالةٍ عندنا.
 *   22023 — الاسم أو الرقم فارغ.
 *
 * ── ولماذا ملفٌّ مستقلّ ──
 * `actions.ts` يبدأ بـ`"use server"` ويستورد `botid/server` وقلمَ الخادم،
 * فلا يُستورد في اختبار. والقرار الذي يقرؤه العميل يستحقّ اختبارًا لا قراءةً.
 *
 * ── ونصوصٌ تقول «للتوّ» ──
 * هذه الرسائل لا تُعرض إلا بعد ضغطةٍ فعليّة على «خذ دورك الآن»، أي بعد أن
 * رأى العميلُ الفرعَ مفتوحًا. ففرقٌ بين «الفرع مغلق» (فيظنّ أنّه أخطأ القراءة)
 * و«أُغلق للتوّ — لم يُسجَّل دورك» (فيعرف ما جرى وأنّ لا دورَ له ينتظره).
 */

/** الرموز التي ترفعها `join_waitlist_guest` فعلًا — مُستخرَجة من القاعدة. */
export const DB_JOIN_CODES = [
  "22023",
  "P0001",
  "P0002",
  "P0003",
  "P0010",
  "P0011",
  "P0429",
] as const;

/** ورمزٌ ثامن من حارسٍ خارج الدالّة: مفتاح الإيقاف العام. */
export const EXTRA_JOIN_CODES = ["P0432"] as const;

type Pair = readonly [ar: string, en: string];

const MESSAGES: Record<string, Pair> = {
  // الاسم أو الرقم فارغ — الواجهة تمنعه، وهذا الحزام الثاني.
  "22023": ["اكتب اسمك ورقم جوّالك ثم أعد المحاولة.", "Enter your name and mobile number, then try again."],
  // الفرع لا يستقبل قائمة انتظار أصلًا (إعداد المالك الدائم).
  P0001: ["هذا الفرع لا يستقبل قائمة انتظار حاليًا.", "This branch isn't taking the queue right now."],
  P0002: ["الفرع غير متاح.", "This branch is unavailable."],
  P0003: ["أُغلق الفرع للتوّ — لم يُسجَّل دورك.", "The branch just closed — your turn wasn't registered."],
  P0010: ["امتلأ الطابور للتوّ — لم يُسجَّل دورك.", "The queue just filled up — your turn wasn't registered."],
  P0011: ["لا يوجد انتظار الآن — تفضّل مباشرةً إلى المطعم.", "There's no wait right now — walk straight in."],
  P0429: ["محاولات كثيرة — انتظر دقائق ثم حاول مجددًا.", "Too many attempts — wait a few minutes and try again."],
  P0432: [
    "التطبيق تحت الصيانة لدقائق — رجاءً جرّب بعد قليل، ودورك محفوظ إن كنت في الطابور.",
    "We're doing quick maintenance — try again shortly. Your place in line is safe.",
  ],
};

/**
 * الرسالة الصريحة لهذا الرمز، أو `null` إن كان رمزًا لا نعرفه.
 *
 * و`null` تعني «استعمل الرسالة العامّة» — لا «اصمت». الصمت هو العطب.
 */
export function joinErrorMessage(code: string | undefined | null, lang: string): string | null {
  if (!code) return null;
  const pair = MESSAGES[code];
  if (!pair) return null;
  return lang === "en" ? pair[1] : pair[0];
}

/**
 * الرسالة العامّة — الملاذ الأخير حين يأتي رمزٌ لم نره قطّ.
 *
 * موجودةٌ هنا لا في مكانٍ آخر كي يستطيع الاختبار أن يؤكّد أنّ **لا رمزٍ
 * معروفٍ يقع فيها**. فالعموميّة مقبولةٌ للمجهول وحده.
 */
export const GENERIC_JOIN_ERROR: Pair = [
  "تعذّر تسجيل دورك — أعد المحاولة بعد لحظات.",
  "Couldn't register your turn — try again in a moment.",
];

export function genericJoinError(lang: string): string {
  return lang === "en" ? GENERIC_JOIN_ERROR[1] : GENERIC_JOIN_ERROR[0];
}
