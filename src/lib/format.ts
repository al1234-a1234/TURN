/** الأرقام تُعرض بالخانات الإنجليزية (اللاتينية) — قرار المنتج. */
export const toAr = (s: string | number) => String(s);

/** سعر موحّد: 50 ر.س (بدون .0) */
export const money = (v: number | null | undefined) =>
  v == null ? "" : `${Math.round(Number(v))} ر.س`;

/** تقدير الوقت بالدقائق حسب عدد من في الطابور (7 دقائق للمجموعة) */
export const MIN_PER_PARTY = 7;
export const waitMinutes = (aheadCount: number) => aheadCount * MIN_PER_PARTY;

/** عدد أشخاص بصيغة عربية طبيعية */
export function peopleAhead(ahead: number): string {
  if (ahead <= 0) return "أنت التالي";
  if (ahead === 1) return "قدامك شخص واحد بس";
  if (ahead === 2) return "قدامك شخصان";
  return `قدامك ${toAr(ahead)} أشخاص`;
}
