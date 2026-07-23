/**
 * نظام الترجمة (عربي/إنجليزي) — نمط مضمّن (inline) بلا قاموس مركزي:
 *   tr(lang, "النص العربي", "English text")
 * آمن دائمًا: يرجّع العربي إن لم تُمرَّر ترجمة. لا مفاتيح ولا تعارضات.
 * هذا الملف نقي (بلا استيراد خادم) فيُستخدم في مكوّنات العميل والخادم معًا.
 */

export type Lang = "ar" | "en";

export const LANGS: Lang[] = ["ar", "en"];

/** الترجمة المضمّنة — العربي أساس، الإنجليزي اختياري. */
export function tr(lang: Lang, ar: string, en?: string): string {
  return lang === "en" && en ? en : ar;
}

/** اتجاه الصفحة حسب اللغة. */
export const dirOf = (lang: Lang): "rtl" | "ltr" => (lang === "en" ? "ltr" : "rtl");

export const LANG_LABEL: Record<Lang, string> = { ar: "العربية", en: "English" };
export const LANG_SHORT: Record<Lang, string> = { ar: "ع", en: "EN" };

/** نسبة مئوية بصيغة اللغة: 50% (إنجليزي) / ٪50 (عربي). */
export const pct = (n: number | string, lang: Lang): string =>
  lang === "en" ? `${n}%` : `٪${n}`;
