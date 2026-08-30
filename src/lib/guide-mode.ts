/**
 * أيُّ خطواتٍ يُريها دليلُ العميل؟
 *
 * ── القيد الحاكم ──
 * «استخدم نفس المصدر/المنطق الموجود فعلًا الذي يقرّر أيّ زرّ يظهر — لا تخترع
 * حقل إعداد جديد». فالوضع يُشتقّ من `accepts_waitlist` و`accepts_reservations`
 * وحدهما، وهما نفس الحقلين اللذين يقرّران ما يراه العميل في `waitlist-form`.
 * أيّ حقلٍ جديدٍ هنا كان سيصير مصدرَ حقيقةٍ ثانيًا يتعارض مع الأوّل بصمت.
 *
 * ── وحين يكون الاثنان متاحين ──
 * الزرّ الرئيسيّ في الصفحة هو «خذ دورك الآن» (تبويب الانتظار هو الافتراضيّ)،
 * فالدليل يشرح خطواته هو. شرحُ مسارين في غطاءٍ من ثلاثة أسطر يُنتج غطاءً
 * لا يُقرأ — والعميل واقفٌ في المطعم.
 *
 * ── ولماذا «أيُّ فرعٍ» لا «كلُّ فرع» ──
 * الغطاء يخصّ المطعم لا فرعًا بعينه، ويظهر قبل أن يختار العميل فرعه. فما دام
 * فرعٌ واحدٌ يقبل الدور، فالدور طريقٌ متاحٌ في هذا المطعم.
 */
export type GuideMode = "waitlist" | "reservations" | "walkin";

export type GuideBranch = { accepts?: boolean; acceptsReservations?: boolean };

export function guideMode(branches: readonly GuideBranch[]): GuideMode {
  const anyWaitlist = branches.some((b) => b.accepts === true);
  if (anyWaitlist) return "waitlist";
  const anyReservations = branches.some((b) => b.acceptsReservations === true);
  if (anyReservations) return "reservations";
  return "walkin";
}

/** مفتاح التخزين المحلّي — مربوطٌ بالمطعم وحده: دليلُ مطعمٍ لا يُسكت دليلَ غيره. */
export function guideSeenKey(slug: string): string {
  return `turn.guide.v1.${slug}`;
}
