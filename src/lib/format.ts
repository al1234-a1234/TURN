import { tr } from "./i18n";
import type { Lang } from "./i18n";

/** الأرقام تُعرض بالخانات الإنجليزية (اللاتينية) — قرار المنتج. */
export const toAr = (s: string | number) => String(s);

/** سعر موحّد: 50 ر.س (بدون .0) */
export const money = (v: number | null | undefined) =>
  v == null ? "" : `${Math.round(Number(v))} ر.س`;

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
