"use client";

import { useState, useTransition } from "react";
import { updateCustomerProfile } from "./actions";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

const TIER_OPTIONS: { value: string; label: string; labelEn: string }[] = [
  { value: "regular", label: "عادي", labelEn: "Regular" },
  { value: "silver", label: "فضي", labelEn: "Silver" },
  { value: "gold", label: "ذهبي", labelEn: "Gold" },
  { value: "vip", label: "VIP", labelEn: "VIP" },
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
  const lang = useLang();
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
        {open ? tr(lang, "إخفاء الإدارة", "Hide management") : tr(lang, "إدارة العميل", "Manage customer")}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[color:var(--ink)]">{tr(lang, "عميل مميّز (VIP)", "VIP customer")}</span>
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
            <label className="field-label">{tr(lang, "الشريحة", "Tier")}</label>
            <select value={tierVal} onChange={(e) => setTierVal(e.target.value)} className="field-input">
              {TIER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{tr(lang, t.label, t.labelEn)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">{tr(lang, `ملاحظة خاصة (${toAr(visits)} زيارة)`, `Private note (${toAr(visits)} visits)`)}</label>
            <textarea
              value={noteVal}
              onChange={(e) => setNoteVal(e.target.value)}
              rows={2}
              placeholder={tr(lang, "تفضيلاته، حساسية طعام، مناسبة…", "Preferences, food allergies, occasion…")}
              className="field-input"
            />
          </div>

          <button type="button" onClick={save} disabled={pending} className="btn btn-primary w-full">
            {pending ? tr(lang, "جارٍ الحفظ…", "Saving…") : saved ? tr(lang, "تم الحفظ ✓", "Saved ✓") : tr(lang, "حفظ", "Save")}
          </button>
        </div>
      )}
    </div>
  );
}
