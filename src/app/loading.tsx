// تحميل فوري للواجهة العامة (العميل) — استجابة لحظية عند الضغط.
export default function RootLoading() {
  const bar = "animate-pulse rounded-2xl";
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="rq-header px-5 pb-6 pt-5">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className={`${bar} h-11 w-11`} style={{ background: "rgba(255,255,255,0.25)" }} />
          <div className={`${bar} h-7 w-32`} style={{ background: "rgba(255,255,255,0.25)" }} />
          <div className={`${bar} h-11 w-11`} style={{ background: "rgba(255,255,255,0.25)" }} />
        </div>
      </div>
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-28 pt-5">
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${bar} h-32`} style={{ background: "var(--surface-2)" }} />
          ))}
        </div>
      </main>
    </div>
  );
}
