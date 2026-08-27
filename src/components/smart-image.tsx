"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

/**
 * صورة تصمد على الشبكات الضعيفة — تجربة المطعم المزدحم لا المكتب.
 *
 * الصورة العادية (next/image) تترك أيقونة «؟» مكسورة إلى الأبد إذا انقطع
 * التحميل في منتصفه: لا إعادة محاولة ولا بديل. عند زبون على واي‑فاي مطعم
 * ضعيف هذا هو الحال الغالب لا النادر.
 *
 * هذا المكوّن:
 *   ١) يعيد المحاولة تلقائيًّا مرّة (بكسر الكاش عبر معامل) قبل الاستسلام.
 *   ٢) يعرض بديلًا بلون الهوية والحرف الأول بدل «؟» — لا فراغ ولا كسر.
 *
 * الاستخدام: بدّل <Image .../> بـ <SmartImage fallbackText={initial} .../>.
 * كل الخصائص تُمرَّر كما هي لـ next/image.
 */
export function SmartImage({
  src,
  alt,
  fallbackText,
  fallbackClassName,
  style,
  onLoad,
  ...rest
}: Omit<ImageProps, "src"> & {
  src: string | null | undefined;
  /** حرف/رمز يُعرَض في البديل — عادةً أول حرف من الاسم */
  fallbackText?: string;
  /** صنف إضافي على صندوق البديل */
  fallbackClassName?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [dead, setDead] = useState(false);
  // كانت الصورة تظهر فجأة لحظة اكتمال الفكّ — شعارٌ دائريّ فوق خلفيةٍ بيضاء
  // يقفز إليها بلا مقدّمة، فيُقرأ الوصول تعليقًا لا تحميلًا. تلاشٍ خفيف
  // (٢٠٠مللي) يحوّلها انتقالًا هادئًا — الوسيط الوحيد المتأثر، لا شيء آخر.
  const [loaded, setLoaded] = useState(false);

  // بديل الهوية: لا رابط أصلًا، أو فشل بعد إعادة المحاولة
  if (!src || dead) {
    return (
      <span
        className={`flex h-full w-full items-center justify-center font-serif text-4xl font-bold text-cream-100 ${fallbackClassName ?? ""}`}
        style={{ background: "var(--brand-solid)" }}
        aria-hidden
      >
        {(fallbackText || "").trim().charAt(0) || "٨"}
      </span>
    );
  }

  // كسر الكاش على المحاولة الثانية: نفس الرابط الفاشل يبقى فاشلًا في الكاش
  const finalSrc = attempt === 0 ? src : `${src}${src.includes("?") ? "&" : "?"}r=${attempt}`;

  return (
    <Image
      {...rest}
      alt={alt}
      src={finalSrc}
      style={{ ...style, opacity: loaded ? 1 : 0, transition: "opacity 200ms ease" }}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      onError={() => {
        if (attempt < 1) setAttempt((a) => a + 1);
        else setDead(true);
      }}
    />
  );
}
