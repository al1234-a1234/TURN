"use client";

import { useState, useTransition } from "react";
import { updateCustomerProfile } from "./actions";
import { toAr } from "@/lib/format";

const TIER_OPTIONS: { value: string; label: string }[] = [
  { value: "regular", label: "عادي" },
  { value: "silver", label: "فضي" },
  { value: "gold", label: "ذهبي" },
  { value: "vip", label: "VIP" },
];

export function CustomerControls({
  customerId,
  isVip,
  tier,
  note,
  visits,
}: {
  customerId: string;
  isVip: boolean;
  tier: string;
  note: string | null;
  visits: number;
}) {
  const [open, setOpen] = useState(false);
  const [vip, setVip] = useState(isVip);
  const [tierVal, setTierVal] = useState(tier);
  const [noteVal, setNoteVal] = useState(note ?? "");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const save = () =>
    start(async () => {
      await updateCustomerProfile(customerId, { is_vip: vip, tier: tierVal, note: noteVal });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    });

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-bold text-brand-700"
      >
        {open ? "إخفاء الإدارة" : "إدارة العميل"}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[color:var(--ink)]">عميل مميّز (VIP)</span>
            <button
              type="button"
              role="switch"
              aria-checked={vip}
              onClick={() => setVip((v) => !v)}
              className="relative h-7 w-12 shrink-0 rounded-full transition"
              style={{ background: vip ? "linear-gradient(160deg,#a8371a,#661c0a)" : "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              <span className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-all" style={{ insetInlineStart: vip ? "1.55rem" : "0.2rem" }} />
            </button>
          </div>

          <div>
            <label className="field-label">الشريحة</label>
            <select value={tierVal} onChange={(e) => setTierVal(e.target.value)} className="field-input">
              {TIER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">ملاحظة خاصة ({toAr(visits)} زيارة)</label>
            <textarea
              value={noteVal}
              onChange={(e) => setNoteVal(e.target.value)}
              rows={2}
              placeholder="تفضيلاته، حساسية طعام، مناسبة…"
              className="field-input"
            />
          </div>

          <button type="button" onClick={save} disabled={pending} className="btn btn-primary w-full">
            {pending ? "جارٍ الحفظ…" : saved ? "تم الحفظ ✓" : "حفظ"}
          </button>
        </div>
      )}
    </div>
  );
}
