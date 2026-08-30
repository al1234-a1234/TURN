"use client";

import { useState, useTransition } from "react";
import { setRestaurantFeature } from "./actions";
import { ToggleSwitch } from "@/components/toggle-switch";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

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
const CATEGORY_LABEL_EN: Record<string, string> = {
  core: "Core (always on)",
  operations: "Operations",
  marketing: "Marketing",
  customer_tools: "Customer tools",
};
const CATEGORY_ORDER = ["core", "operations", "marketing", "customer_tools"];

function Toggle({
  restaurantId,
  row,
}: {
  restaurantId: string;
  row: ModuleRow;
}) {
  const lang = useLang();
  const [on, setOn] = useState(row.enabled);
  const [pending, start] = useTransition();
  const locked = row.is_core;

  return (
    <ToggleSwitch
      on={on}
      disabled={locked || pending}
      onToggle={() =>
        start(async () => {
          const next = !on;
          setOn(next);
          await setRestaurantFeature(restaurantId, row.key, next);
        })
      }
      title={row.name_ar}
      hint={locked ? tr(lang, "أساسي — لا يُطفأ", "Core — can't be turned off") : row.description_ar}
      srLabel={on ? tr(lang, "مُفعّل", "On") : tr(lang, "متوقّف", "Off")}
    />
  );
}

export function ModuleToggles({
  restaurantId,
  modules,
}: {
  restaurantId: string;
  modules: ModuleRow[];
}) {
  const lang = useLang();
  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    rows: modules.filter((m) => m.category === cat),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.cat}>
          <h3 className="mb-2 text-sm font-bold text-[color:var(--muted)]">{tr(lang, CATEGORY_LABEL[g.cat] ?? g.cat, CATEGORY_LABEL_EN[g.cat] ?? g.cat)}</h3>
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
