import { tr } from "./i18n";
import type { Lang } from "./i18n";

/** الأرقام تُعرض بالخانات الإنجليزية (اللاتينية) — قرار المنتج. */
export const toAr = (s: string | number) => String(s);

/** سعر موحّد: 50 ر.س / 50 SAR (بدون .0) */
export const money = (v: number | null | undefined, lang: Lang = "ar") =>
  v == null ? "" : `${Math.round(Number(v))} ${lang === "en" ? "SAR" : "ر.س"}`;

/** تقدير الوقت بالدقائق حسب عدد من في الطابور (7 دقائق للمجموعة) */
export const MIN_PER_PARTY = 7;
export const waitMinutes = (aheadCount: number) => aheadCount * MIN_PER_PARTY;

/** عدد أشخاص بصيغة عربية طبيعية */
export function peopleAhead(ahead: number, lang: Lang = "ar"): string {
  if (ahead <= 0) return tr(lang, "أنت التالي", "You're next");
  if (ahead === 1) return tr(lang, "قدامك شخص واحد بس", "1 person ahead of you");
  if (ahead === 2) return tr(lang, "قدامك شخصان", "2 people ahead of you");
  return tr(lang, `قدامك ${toAr(ahead)} أشخاص`, `${toAr(ahead)} people ahead of you`);
}

/**
 * تطبيع رقم الجوّال: يحوّل الأرقام العربية (٠-٩) والفارسية (۰-۹) إلى لاتينية
 * ويزيل كل ما عداها (مسافات، شرطات، +، إلخ).
 *
 * السبب: حقل الجوّال كان يقبل خلط الخانات فيُحفظ مثل «0506089164٦»، فيتشظّى
 * سجلّ العميل الواحد إلى عميلين ولا تتطابق عمليات البحث بالرقم لاحقًا.
 */
export function normalizePhone(input: string): string {
  return (input ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
}
