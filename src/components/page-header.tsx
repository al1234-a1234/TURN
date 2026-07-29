/**
 * الهيدر الملوّن المشترك بين الرئيسية وصفحة المطعم — نفس الارتفاع واللون
 * والانحناءات حرفيًّا (مصدر واحد، لا نسختان تتفرّقان مع الوقت). محتوى الصفّ
 * العلوي يبقى خاصًّا بكل صفحة (قائمة/بحث بالرئيسية، رجوع/مشاركة بصفحة المطعم)،
 * و`overlap` منفذ اختياري لعنصر يتجاوز الحافة السفلية (شعار مطعم مثلًا).
 */
export function SharedHeader({
  children,
  overlap,
}: {
  children: React.ReactNode;
  overlap?: React.ReactNode;
}) {
  return (
    <header className="rq-header relative px-5 pb-5 pt-5">
      <div className="mx-auto flex max-w-2xl items-center justify-between">{children}</div>
      {overlap}
    </header>
  );
}
