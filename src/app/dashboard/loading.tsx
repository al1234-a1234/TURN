// شاشة تحميل فورية تظهر لحظة الضغط على أي تبويب — تعطي إحساسًا بالاستجابة الفورية.
export default function DashboardLoading() {
  const bar = "animate-pulse rounded-2xl";
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* هيكل القائمة الجانبية (ديسكتوب) */}
      <aside className="hidden w-64 shrink-0 flex-col border-e bg-white p-4 lg:flex" style={{ borderColor: "var(--border)" }}>
        <div className={`${bar} h-9 w-9`} style={{ background: "var(--surface-2)" }} />
        <div className={`${bar} mt-4 h-5 w-32`} style={{ background: "var(--surface-2)" }} />
        <div className="mt-6 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`${bar} h-11 w-full`} style={{ background: "var(--surface-2)" }} />
          ))}
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* هيدر جوال */}
        <div className="app-header px-5 pb-12 pt-5 lg:hidden">
          <div className={`${bar} h-10 w-40`} style={{ background: "rgba(255,255,255,0.25)" }} />
        </div>

        <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-16 pt-6 lg:pt-8">
          {/* مؤشرات */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`${bar} h-20`} style={{ background: "var(--surface-2)" }} />
            ))}
          </div>
          {/* بطاقات */}
          <div className="mt-6 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`${bar} h-28`} style={{ background: "var(--surface-2)" }} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
