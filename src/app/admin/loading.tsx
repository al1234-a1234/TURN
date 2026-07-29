export default function Loading() {
  const bar = "animate-pulse rounded-2xl";
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-5 py-12">
      <div className={`${bar} h-40`} style={{ background: "var(--surface-2)" }} />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className={`${bar} h-16`} style={{ background: "var(--surface-2)" }} />
      ))}
    </div>
  );
}
