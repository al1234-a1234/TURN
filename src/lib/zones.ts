import type { Lang } from "@/lib/i18n";

/**
 * أقسام الجلوس — يعرّفها المالك، لا «داخلي/خارجي» مثبّتين.
 *
 * المفتاح (`key`) هو ما يُخزَّن في `tables.zone` و`waitlist_entries.zone`،
 * وهو ثابتٌ لا يتغيّر بتغيّر الاسم: إعادة تسمية «خارجي» إلى «التراس» يجب
 * ألّا تيتّم طاولاته ولا أدوار الطابور القائمة عليه.
 */
export type Zone = {
  key: string;
  name: string;
  nameEn: string | null;
};

/** اسم القسم بلغة العميل، وبالعربية إن لم يضع المالك اسمًا إنجليزيًّا. */
export function zoneLabel(z: Zone, lang: Lang): string {
  return lang === "en" ? (z.nameEn?.trim() || z.name) : z.name;
}

/**
 * مفتاحٌ لاتينيّ من اسمٍ عربيّ.
 *
 * القاعدة تشترط `^[a-z0-9_]{2,24}$`، والمالك يكتب «عوائل». فلا نترجم — نولّد
 * مفتاحًا مستقرًّا ونتركه للقاعدة، والاسم المعروض هو ما كتبه. وإن لم يبقَ من
 * الاسم حرفٌ لاتينيّ (وهو الغالب في العربية) نعطيه مفتاحًا مرقّمًا.
 */
export function zoneKeyFrom(name: string, taken: ReadonlySet<string>): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

  const seed = base.length >= 2 ? base : "zone";
  if (!taken.has(seed) && seed.length >= 2) return seed;

  for (let i = 2; i < 999; i++) {
    const candidate = `${seed.slice(0, 20)}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `zone_${Date.now().toString(36).slice(-6)}`;
}
