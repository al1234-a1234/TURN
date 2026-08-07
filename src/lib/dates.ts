import type { Lang } from "./i18n";

/**
 * تواريخ وأوقات موحّدة لكل التطبيق — مثبّتة على توقيت السعودية.
 *
 * السبب: صفحات اللوحة تُرسم على الخادم (Vercel = UTC)، و toLocale* بلا
 * timeZone تطبع توقيت الخادم — فكانت الأوقات تظهر ناقصة ٣ ساعات، وحدود
 * «اليوم» (إحصاءات اليوم/الرسوم اليومية) تنقلب على يوم خاطئ بين منتصف
 * الليل و٣ فجرًا بتوقيت الرياض. كل تنسيق أو حدّ يومي يمرّ من هنا.
 */
export const TZ = "Asia/Riyadh";

/** ٢٦ يوليو 2026، 7:24 م — أرقام لاتينية دائمًا (قرار المنتج). */
export function fmtDateTime(iso: string | null | undefined, lang: Lang = "ar"): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** ٢٦ يوليو 2026 */
export function fmtDate(iso: string | null | undefined, lang: Lang = "ar"): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** ٢٦ يوليو (بلا سنة — للرسوم والقوائم المضغوطة) */
export function fmtDayShort(iso: string | Date, lang: Lang = "ar"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
  });
}

/** 7:24 م */
export function fmtTime(iso: string | null | undefined, lang: Lang = "ar"): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * بداية اليوم بتوقيت الرياض (منتصف الليل المحلي) كنقطة زمنية UTC صحيحة.
 * daysAgo=1 يعني أمس، وهكذا. السعودية بلا توقيت صيفي، فالإزاحة +3 ثابتة يقينًا.
 */
export function riyadhDayStart(daysAgo = 0): Date {
  const OFFSET = 3 * 3600_000;
  const nowRiyadh = new Date(Date.now() + OFFSET);
  const startUtcMs =
    Date.UTC(nowRiyadh.getUTCFullYear(), nowRiyadh.getUTCMonth(), nowRiyadh.getUTCDate() - daysAgo) - OFFSET;
  return new Date(startUtcMs);
}

/** كم مضى على تاريخٍ ما — «قبل ٣ أيام» بصيغة مقروءة. */
export function daysAgoLabel(iso: string | null | undefined, lang: Lang = "ar"): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return lang === "en" ? "Today" : "اليوم";
  if (days === 1) return lang === "en" ? "Yesterday" : "أمس";
  if (days < 30) return lang === "en" ? `${days} days ago` : `قبل ${days} يوم`;
  const months = Math.floor(days / 30);
  if (months < 12) return lang === "en" ? `${months} mo ago` : `قبل ${months} شهر`;
  return lang === "en" ? `${Math.floor(months / 12)} yr ago` : `قبل ${Math.floor(months / 12)} سنة`;
}

/** ساعة الحدث بتوقيت الرياض (0-23) — getHours() على الخادم تُرجع UTC (خطأ ٣ ساعات). */
export function riyadhHour(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return (d.getUTCHours() + 3) % 24;
}

/** مفتاح يوم بتوقيت الرياض (yyyy-m-d) — لتجميع الرسوم اليومية بلا انزلاق UTC. */
export function riyadhDayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const r = new Date(d.getTime() + 3 * 3600_000);
  return `${r.getUTCFullYear()}-${r.getUTCMonth()}-${r.getUTCDate()}`;
}

/** يوم الأسبوع بتوقيت الرياض (0=الأحد مثل getDay). */
export function riyadhWeekday(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() + 3 * 3600_000).getUTCDay();
}

function parseHHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * هل الوقت الآن (بتوقيت الرياض) ضمن ساعات الدوام [open, close)؟ يدعم النطاق
 * الليلي (يفتح مساءً ويقفل بعد منتصف الليل). بلا ساعات مضبوطة أو بقيمة
 * تالفة = مفتوح دائمًا — لا نغلق فرعًا لم يضبط ساعاته أصلًا. يطابق دالة
 * branch_open_by_hours في القاعدة (نفس المنطق على الطرفين).
 */
export function isWithinOpeningHours(
  hours: { open?: string | null; close?: string | null } | null | undefined,
): boolean {
  const open = parseHHMM(hours?.open);
  const close = parseHHMM(hours?.close);
  if (open == null || close == null) return true;
  if (open === close) return true;
  const nowRiyadh = new Date(Date.now() + 3 * 3600_000);
  const cur = nowRiyadh.getUTCHours() * 60 + nowRiyadh.getUTCMinutes();
  return open < close ? cur >= open && cur < close : cur >= open || cur < close;
}

/**
 * تاريخ يومٍ بصيغة `YYYY-MM-DD` بتوقيت الرياض — الصيغة التي يقبلها عمود
 * `date` في القاعدة. `toISOString().slice(0,10)` يعطي يوم UTC، فينزلق ليلًا
 * إلى «أمس» بين منتصف الليل والثالثة فجرًا.
 */
export function riyadhISODate(d: Date = new Date()): string {
  const r = new Date(d.getTime() + 3 * 3600_000);
  const mm = String(r.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(r.getUTCDate()).padStart(2, "0");
  return `${r.getUTCFullYear()}-${mm}-${dd}`;
}
