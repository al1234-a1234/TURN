"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toAr } from "@/lib/format";

/** الشاشة عربيّة دائمًا (معلّقة في الصالة) فيكفيها الاسم العربي. */
type Zone = { key: string; name: string; active: boolean };

type Row = {
  rank: number | null;
  display_name: string | null;
  status: string | null;
  zone: string | null;
  served_today: number;
};

/** لوحة الطابور الحيّة لشاشة الصالة — استطلاع كل ١٠ ثوانٍ بنمط التذكرة نفسه. */
export function TvBoard({
  branchId,
  initial,
  zones,
}: {
  branchId: string;
  initial: Row[];
  /** أقسام الفرع — شاشة الصالة لا تعرض عمودًا لقسمٍ لا وجود له */
  /** أقسام الفرع بأسماء المالك — مرتّبةً كما رتّبها */
  zones: Zone[];
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [tick, setTick] = useState(0);

  const poll = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("tv_queue", { p_branch_id: branchId });
    if (!error && data) setRows(data as Row[]);
  }, [branchId]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const loop = async () => {
      if (stopped || document.hidden) return;
      await poll();
      setTick((t) => t + 1);
      clear(); timer = setTimeout(loop, 10_000);
    };
    const onVis = () => { if (document.hidden) clear(); else if (!stopped) loop(); };
    document.addEventListener("visibilitychange", onVis);
    clear(); timer = setTimeout(loop, 10_000);
    return () => { stopped = true; clear(); document.removeEventListener("visibilitychange", onVis); };
  }, [poll]);

  const live = rows.filter((r) => r.rank != null);
  const rowsOf = (key: string) => live.filter((r) => r.zone === key);
  // عمودٌ لقسمٍ لا يملكه المطعم يظهر فارغًا أبدًا على شاشةٍ في صالته،
  // فيقرؤه الضيف «لا أحد بالانتظار» ويظنّ الشاشة معطّلة. وقسمٌ أُطفئ وفيه
  // منتظرون يبقى — من وقف في الطابور لا يختفي من الشاشة.
  const shownZones = zones.filter((z) => z.active || rowsOf(z.key).length > 0);
  const served = rows[0]?.served_today ?? 0;
  const nowServing = live.filter((r) => r.status === "notified");

  const Column = ({ title, list }: { title: string; list: Row[] }) => (
    <div className="flex-1 min-w-0">
      <h2 className="mb-4 text-center font-display text-3xl font-bold" style={{ color: "var(--brand-d)" }}>{title}</h2>
      {list.length === 0 ? (
        <p className="rounded-3xl py-14 text-center text-2xl font-bold" style={{ background: "rgba(102,28,10,0.05)", color: "var(--muted)" }}>
          لا أحد بالانتظار
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={`${r.zone}-${r.rank}`}
                className="flex items-center gap-5 rounded-3xl px-6 py-4"
                style={r.status === "notified"
                  ? { background: "var(--brand-solid)", boxShadow: "0 18px 34px -20px rgba(102,28,10,0.7)" }
                  : { background: "var(--surface)", border: "1px solid rgba(102,28,10,0.12)" }}>
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-display text-4xl font-bold"
                    style={r.status === "notified" ? { background: "rgba(255,255,255,0.16)", color: "var(--brand-ink)" } : { background: "var(--brand-solid)", color: "var(--brand-ink)" }}>
                {toAr(r.rank ?? 0)}
              </span>
              <span className="min-w-0 flex-1 truncate font-display text-3xl font-bold"
                    style={{ color: r.status === "notified" ? "var(--brand-ink)" : "var(--ink)" }}>
                {r.display_name}
              </span>
              {r.status === "notified" && (
                <span className="shrink-0 animate-pulse rounded-full bg-white/20 px-4 py-1.5 text-lg font-extrabold text-cream-100">
                  تفضّل 🔔
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* شريط النداء */}
      {nowServing.length > 0 && (
        <div className="rounded-3xl px-8 py-5 text-center" style={{ background: "var(--brand-solid)" }}>
          <p className="font-display text-4xl font-bold text-cream-100">
            🔔 نُنادي الآن: {nowServing.map((r) => `رقم ${toAr(r.rank ?? 0)}`).join(" · ")}
          </p>
        </div>
      )}

      <div className="flex flex-1 gap-8">
        {shownZones.map((z) => (
          <Column key={z.key} title={z.name} list={rowsOf(z.key)} />
        ))}
      </div>

      <p className="text-center text-lg font-bold" style={{ color: "var(--muted)" }}>
        خدمنا اليوم {toAr(served)} ضيفًا · بالطابور الآن {toAr(live.length)}
        <span className="ms-3 inline-block h-2 w-2 rounded-full align-middle" style={{ background: tick % 2 ? "var(--brand-d)" : "rgba(102,28,10,0.25)" }} />
      </p>
    </div>
  );
}
