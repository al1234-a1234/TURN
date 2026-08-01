import Link from "next/link";

/**
 * شعار إيت / EIGHT — الرقم ٨ بخط DM Serif Display داخل مربّع بتقويس ٢٣٪.
 * متجه وحادّ بأي مقاس (بلا صورة نقطية).
 *
 * قواعد ملزمة:
 * - المقاس كلّه من `font-size`؛ العرض والارتفاع `1em` في CSS فلا يُمرَّران هنا.
 * - تحت 72px تُحذف الكلمة تلقائيًّا. الحدّ كان 40px فكانت الكلمة عند 40–64
 *   لطخة رمادية غير مقروءة (ارتفاعها هناك أقل من ٥ بكسل) — رُفع بعد
 *   معاينة الشعار مطبوعًا بكل مقاساته.
 * - بلا كلمة يكبر الرقم ويتوسّط (`badge--solo`) فلا يضيع في المربّع.
 * - `light` تعطي النسخة الفاتحة فوق الخلفيات العنابية (الهيدر والأزرار).
 */
export function BrandMark({
  size = 40,
  light = false,
  withName,
}: {
  size?: number;
  light?: boolean;
  withName?: boolean;
}) {
  const showName = withName ?? size >= 72;
  return (
    <span
      className={`badge${light ? " badge--light" : ""}${showName ? "" : " badge--solo"}`}
      style={{ fontSize: size }}
      aria-label="EIGHT"
      role="img"
    >
      <span>
        <span className="letter">8</span>
        {showName && <span className="word">EIGHT</span>}
      </span>
    </span>
  );
}

export function BrandLink({
  href = "/",
  size = 40,
  className = "",
}: {
  href?: string;
  size?: number;
  className?: string;
}) {
  return (
    <Link href={href} className={`flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} />
      <span className="font-display text-lg font-bold text-cream-100/95">إيت</span>
    </Link>
  );
}
