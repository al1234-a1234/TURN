// components/Logo.tsx
// شعار 8 / EIGHT — منقول حرفيًّا من LOGO-SPEC.md (القسم ٢).
// لا يُعدَّل أي رقم هنا: كل قيمة في الأنماط تحلّ مشكلة توسيط موصوفة في
// القسم ٤ من المواصفة. المرجع البصري: LOGO-REFERENCE.html

type LogoProps = {
  /** المقاس بالبكسل — كل شي داخل الشعار يُحسب منه */
  size?: number;
  /** إظهار كلمة EIGHT — تُحذف تلقائيًا تحت 40px */
  withName?: boolean;
  /** النسخة المعكوسة — احتياطية، اقرأ القسم ٦ قبل استخدامها */
  inverted?: boolean;
  className?: string;
};

export function Logo({
  size = 96,
  withName = true,
  inverted = false,
  className = "",
}: LogoProps) {
  const showWord = withName && size >= 40;

  return (
    <span
      className={`eight-badge${inverted ? " eight-badge--inverted" : ""} ${className}`}
      style={{ fontSize: size }}
      role="img"
      aria-label="EIGHT"
    >
      <span className="eight-stack">
        <span className="eight-letter">8</span>
        {showWord && <span className="eight-word">EIGHT</span>}
      </span>
    </span>
  );
}
