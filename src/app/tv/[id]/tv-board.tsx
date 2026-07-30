"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toAr } from "@/lib/format";

type Row = {
  rank: number | null;
  display_name: string | null;
  status: string | null;
  zone: string | null;
  served_today: number;
};

/** لوحة الطابور الحيّة لشاشة الصالة — استطلاع كل ١٠ ثوانٍ بنمط التذكرة نفسه. */
export function TvBoard({ branchId, initial }: { branchId: string; initial: Row[] }) {
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
  const inside = live.filter((r) => r.zone === "inside");
  const outside = live.filter((r) => r.zone === "outside");
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
                  : { background: "#fff", border: "1px solid rgba(102,28,10,0.12)" }}>
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-display text-4xl font-bold"
                    style={r.status === "notified" ? { background: "rgba(255,255,255,0.16)", color: "#fff" } : { background: "var(--brand-solid)", color: "#fff" }}>
                {toAr(r.rank ?? 0)}
              </span>
              <span className="min-w-0 flex-1 truncate font-display text-3xl font-bold"
                    style={{ color: r.status === "notified" ? "#fff" : "var(--ink)" }}>
                {r.display_name}
              </span>
              {r.status === "notified" && (
                <span className="shrink-0 animate-pulse rounded-full bg-white/20 px-4 py-1.5 text-lg font-extrabold text-white">
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
          <p className="font-display text-4xl font-bold text-white">
            🔔 نُنادي الآن: {nowServing.map((r) => `رقم ${toAr(r.rank ?? 0)}`).join(" · ")}
          </p>
        </div>
      )}

      <div className="flex flex-1 gap-8">
        <Column title="🏠 الطاولات الداخلية" list={inside} />
        <Column title="🌤 الطاولات الخارجية" list={outside} />
      </div>

      <p className="text-center text-lg font-bold" style={{ color: "var(--muted)" }}>
        خدمنا اليوم {toAr(served)} ضيفًا · بالطابور الآن {toAr(live.length)}
        <span className="ms-3 inline-block h-2 w-2 rounded-full align-middle" style={{ background: tick % 2 ? "var(--brand-d)" : "rgba(102,28,10,0.25)" }} />
      </p>
    </div>
  );
}
