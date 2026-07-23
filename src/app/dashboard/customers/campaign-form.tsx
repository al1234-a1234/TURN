"use client";

import { useState } from "react";
import { grantRewardToSegment } from "./actions";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

type Counts = { all: number; vip: number; gold: number; silver: number; returning: number };

export function CampaignForm({ counts }: { counts: Counts }) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"gift" | "discount">("gift");
  const [segment, setSegment] = useState<keyof Counts>("vip");

  const SEG: { key: keyof Counts; ar: string; en: string }[] = [
    { key: "all", ar: "الكل", en: "All" },
    { key: "vip", ar: "VIP", en: "VIP" },
    { key: "gold", ar: "ذهبي", en: "Gold" },
    { key: "silver", ar: "فضّي", en: "Silver" },
    { key: "returning", ar: "عائدون", en: "Returning" },
  ];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl py-3 text-sm font-bold text-white transition active:scale-[0.99]"
        style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}
      >
        {tr(lang, "📣 حملة مكافآت — أرسل هديّة/خصم لشريحة", "📣 Reward campaign — send a gift/discount to a segment")}
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await grantRewardToSegment(fd);
        setOpen(false);
      }}
      className="soft-card space-y-3 p-4"
    >
      <p className="font-display text-base font-bold text-[color:var(--ink)]">{tr(lang, "حملة مكافآت", "Reward campaign")}</p>

      {/* الشريحة */}
      <div>
        <label className="field-label">{tr(lang, "الشريحة المستهدفة", "Target segment")}</label>
        <div className="grid grid-cols-5 gap-1.5 rounded-2xl bg-[color:var(--surface-2)] p-1">
          {SEG.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSegment(s.key)}
              className="rounded-xl py-2 text-xs font-bold transition"
              style={segment === s.key ? { background: "linear-gradient(160deg,#a8371a,#661c0a)", color: "#fff" } : { color: "var(--muted)" }}
            >
              {tr(lang, s.ar, s.en)}
              <span className="block text-[10px] opacity-80">{toAr(counts[s.key])}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          {tr(lang, `ستصل إلى ${toAr(counts[segment])} عميل`, `Will reach ${toAr(counts[segment])} customers`)}
        </p>
      </div>
      <input type="hidden" name="segment" value={segment} />

      {/* النوع */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[color:var(--surface-2)] p-1">
        {(["gift", "discount"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className="rounded-xl py-2 text-sm font-bold transition"
            style={kind === k ? { background: "linear-gradient(160deg,#a8371a,#661c0a)", color: "#fff" } : { color: "var(--muted)" }}
          >
            {k === "gift" ? tr(lang, "🎁 هديّة", "🎁 Gift") : tr(lang, "٪ خصم", "٪ Discount")}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />

      <div>
        <label className="field-label">{tr(lang, "العنوان", "Title")}</label>
        <input name="title" required className="field-input" placeholder={tr(lang, "مثال: هديّة عملائنا المميّزين", "e.g. Gift for our VIPs")} />
      </div>

      {kind === "discount" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="field-label">{tr(lang, "القيمة", "Value")}</label>
            <input name="value" inputMode="numeric" className="field-input" placeholder="20" />
          </div>
          <div>
            <label className="field-label">{tr(lang, "النوع", "Type")}</label>
            <select name="value_kind" className="field-input">
              <option value="percent">{tr(lang, "٪ نسبة", "% Percent")}</option>
              <option value="amount">{tr(lang, "ر.س مبلغ", "SAR Amount")}</option>
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="field-label">{tr(lang, "رمز (اختياري)", "Code (optional)")}</label>
          <input name="code" className="field-input" dir="ltr" placeholder="VIP2026" />
        </div>
        <div>
          <label className="field-label">{tr(lang, "ينتهي بعد (يوم)", "Expires in (days)")}</label>
          <input name="expires_days" inputMode="numeric" className="field-input" placeholder="30" />
        </div>
      </div>

      <div>
        <label className="field-label">{tr(lang, "وصف (اختياري)", "Description (optional)")}</label>
        <input name="description" className="field-input" placeholder={tr(lang, "شكرًا لولائك 🤍", "Thanks for your loyalty 🤍")} />
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1">{tr(lang, "إرسال للشريحة", "Send to segment")}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">{tr(lang, "إلغاء", "Cancel")}</button>
      </div>
    </form>
  );
}
