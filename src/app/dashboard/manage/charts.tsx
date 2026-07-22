import { toAr } from "@/lib/format";

/** رسم أعمدة بسيط (بلا مكتبات) */
export function ColumnChart({
  data,
  color = "var(--brand)",
  height = 132,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end justify-between gap-2" style={{ height }}>
      {data.map((d, i) => {
        const h = Math.round((d.value / max) * (height - 26));
        return (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="text-[11px] font-extrabold text-[color:var(--ink)]">{d.value > 0 ? toAr(d.value) : ""}</span>
            <span
              className="w-full max-w-[26px] rounded-t-lg"
              style={{ height: Math.max(h, 3), background: color, opacity: d.value ? 1 : 0.25 }}
            />
            <span className="truncate text-[10px] font-bold text-[color:var(--muted)]">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** شريطان أفقيان للمقارنة (داخلي/خارجي مثلاً) */
export function SplitBars({
  rows,
}: {
  rows: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center justify-between text-sm font-bold">
            <span className="text-[color:var(--muted)]">{r.label}</span>
            <span style={{ color: r.color }}>{toAr(r.value)}</span>
          </div>
          <span className="block h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
            <span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="soft-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-[color:var(--ink)]">{title}</h3>
        {hint && <span className="text-xs font-bold text-[color:var(--muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
