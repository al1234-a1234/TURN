"use client";

import { useState } from "react";
import { grantReward } from "../actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

export function RewardForm({ customerId }: { customerId: string }) {
  const lang = useLang();
  const [kind, setKind] = useState<"gift" | "discount">("gift");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed py-3 text-sm font-bold text-brand-700 transition hover:bg-[color:var(--surface-2)]"
        style={{ borderColor: "var(--border)" }}
      >
        {tr(lang, "🎁 امنح هديّة أو خصم", "🎁 Grant a gift or discount")}
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await grantReward(fd);
        setOpen(false);
        setKind("gift");
      }}
      className="soft-card space-y-3 p-4"
    >
      <input type="hidden" name="customer_id" value={customerId} />

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
        <input name="title" required className="field-input" placeholder={kind === "gift" ? tr(lang, "مثال: حلى مجاني", "e.g. Free dessert") : tr(lang, "مثال: خصم ترحيبي", "e.g. Welcome discount")} />
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
          <input name="code" className="field-input" placeholder="VIP2026" dir="ltr" />
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
        <button type="submit" className="btn btn-primary flex-1">{tr(lang, "منح المكافأة", "Grant reward")}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">{tr(lang, "إلغاء", "Cancel")}</button>
      </div>
    </form>
  );
}
