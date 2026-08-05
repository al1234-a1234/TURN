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

/**
 * يحوّل أي صيغة سعودية إلى الصيغة المعيارية 05XXXXXXXX (١٠ خانات).
 * يقبل: 0501234567 · 501234567 · 966501234567 · +966501234567 · 00966...
 * يعيد "" إن كان الرقم غير صالح — فلا يُحفظ عميل برقم مشوّه.
 */
export function saudiMobile(input: string): string {
  let d = normalizePhone(input);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("966")) d = d.slice(3);
  if (d.startsWith("5") && d.length === 9) d = "0" + d;
  return /^05\d{8}$/.test(d) ? d : "";
}

/**
 * رابط خارجي آمن — أو null.
 *
 * أي رابط يأتي من إدخال (روابط المطعم التي يضعها المالك) ويُوضع في href
 * لا يجوز أن يُمرَّر خامًا: `javascript:...` في href ينفّذ سكربتًا في أصل
 * موقعنا بسياق الزبون — وReact لا يحجبه (تحذير فقط). و`startsWith("http")`
 * ليس حارسًا: يمرّر `http://` غير المشفّر ولا يتحقّق من صحّة الرابط أصلًا.
 *
 * القاعدة هنا قائمة بيضاء صريحة: https فقط. وما جاء بلا بروتوكول يُفترض https.
 * ما عداه → null، فيُخفي المستدعي الزرّ بدل أن يعرض فخًّا.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(candidate);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
