"use client";

import { useState, useTransition } from "react";
import { setRestaurantFeature } from "./actions";

export type ModuleRow = {
  key: string;
  name_ar: string;
  description_ar: string | null;
  category: string;
  is_core: boolean;
  enabled: boolean; // الحالة الفعّالة الحالية
};

const CATEGORY_LABEL: Record<string, string> = {
  core: "الأساسية (دائمًا مُفعّلة)",
  operations: "التشغيل",
  marketing: "التسويق",
  customer_tools: "أدوات العملاء",
};
const CATEGORY_ORDER = ["core", "operations", "marketing", "customer_tools"];

function Toggle({
  restaurantId,
  row,
}: {
  restaurantId: string;
  row: ModuleRow;
}) {
  const [on, setOn] = useState(row.enabled);
  const [pending, start] = useTransition();
  const locked = row.is_core;

  return (
    <div className="flex items-center gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-[color:var(--ink)]">{row.name_ar}</p>
        {row.description_ar && <p className="mt-0.5 text-xs text-[color:var(--muted)]">{row.description_ar}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={locked || pending}
        onClick={() =>
          start(async () => {
            const next = !on;
            setOn(next);
            await setRestaurantFeature(restaurantId, row.key, next);
          })
        }
        className="relative h-7 w-12 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-70"
        style={{ background: on ? "linear-gradient(160deg,#a8371a,#661c0a)" : "var(--surface-2)", border: "1px solid var(--border)" }}
        title={locked ? "أساسي — لا يُطفأ" : on ? "مُفعّل" : "متوقّف"}
      >
        <span className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-all" style={{ insetInlineStart: on ? "1.55rem" : "0.2rem" }} />
      </button>
    </div>
  );
}

export function ModuleToggles({
  restaurantId,
  modules,
}: {
  restaurantId: string;
  modules: ModuleRow[];
}) {
  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    rows: modules.filter((m) => m.category === cat),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.cat}>
          <h3 className="mb-2 text-sm font-bold text-[color:var(--muted)]">{CATEGORY_LABEL[g.cat] ?? g.cat}</h3>
          <div className="space-y-2">
            {g.rows.map((row) => (
              <Toggle key={row.key} restaurantId={restaurantId} row={row} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
