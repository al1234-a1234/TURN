// هيكل تحميل فوري خاص بصفحة المطعم — يظهر لحظة الضغط من الرئيسية، لا شاشة
// بيضاء بانتظار جلب البيانات. مطابق شكليًّا للهيدر ولبطاقة تعريف المطعم
// الحقيقيّين كي لا يحسّ العميل بقفزة عند استبداله بالمحتوى الفعلي.
export default function RestaurantLoading() {
  const bar = "animate-pulse rounded-2xl";
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="rq-header relative px-5 pb-5 pt-5">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className={`${bar} h-11 w-11`} style={{ background: "rgba(120,30,12,0.10)" }} />
          <div className={`${bar} h-11 w-11`} style={{ background: "rgba(120,30,12,0.10)" }} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
          <div className={`${bar} h-20 w-20 translate-y-1/2`} style={{ background: "rgba(120,30,12,0.10)" }} />
        </div>
      </div>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-14 pt-16">
        <div className="grid grid-cols-4 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${bar} h-16`} style={{ background: "var(--surface-2)" }} />
          ))}
        </div>
        <div className="mt-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`${bar} h-24`} style={{ background: "var(--surface-2)" }} />
          ))}
        </div>
      </main>
    </div>
  );
}
