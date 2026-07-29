/**
 * هيكل تحميل عام لمحتوى صفحات لوحة المالك (لا يعيد رسم القائمة الجانبية —
 * تلك تبقى ثابتة من layout.tsx). يظهر فور الضغط على أي تبويب بدل تجمّد الشاشة
 * لحين اكتمال جلب البيانات من الخادم.
 */
export function SectionLoading() {
  const bar = "animate-pulse rounded-2xl";
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${bar} h-20`} style={{ background: "var(--surface-2)" }} />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`${bar} h-28`} style={{ background: "var(--surface-2)" }} />
        ))}
      </div>
    </div>
  );
}
