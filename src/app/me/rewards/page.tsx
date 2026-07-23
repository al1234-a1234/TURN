"use client";

import { useEffect, useState } from "react";
import { CustomerShell } from "@/components/customer-shell";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/lang-provider";
import { tr } from "@/lib/i18n";
import { toAr, money } from "@/lib/format";

type Reward = {
  id: string;
  restaurant: string;
  restaurant_slug: string;
  kind: string;
  title: string;
  value: number | null;
  value_kind: string;
  description: string | null;
  code: string | null;
  expires_at: string | null;
};

export default function MyRewardsPage() {
  const lang = useLang();
  const [phone, setPhone] = useState("");
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("turn:phone") : null;
    if (saved) setPhone(saved);
  }, []);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const p = phone.trim();
    if (!p) return;
    setLoading(true);
    try {
      window.localStorage.setItem("turn:phone", p);
      const supabase = createClient();
      const { data } = await supabase.rpc("get_customer_rewards", { p_phone: p });
      setRewards((data ?? []) as Reward[]);
    } finally {
      setLoading(false);
    }
  }

  const valueLabel = (r: Reward) =>
    r.kind === "discount" && r.value != null
      ? r.value_kind === "amount" ? money(r.value) : `${toAr(r.value)}%`
      : "";
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-nu-latn", { day: "2-digit", month: "short" }) : "";

  return (
    <CustomerShell title={tr(lang, "هداياي", "My rewards")} active="other" search={false}>
      <div className="space-y-5">
        <div className="rq-card p-5">
          <p className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "هداياك وخصوماتك", "Your gifts & discounts")}</p>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">{tr(lang, "أدخل رقم جوّالك لعرض ما أهدتك إياه المطاعم.", "Enter your mobile number to see what restaurants gifted you.")}</p>
          <form onSubmit={lookup} className="mt-3 flex gap-2">
            <input
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx"
              className="field-input flex-1 text-left"
            />
            <button type="submit" disabled={loading} className="rq-btn shrink-0 px-5">
              {loading ? "…" : tr(lang, "عرض", "Show")}
            </button>
          </form>
        </div>

        {rewards !== null && (
          rewards.length === 0 ? (
            <div className="rq-card p-10 text-center text-[color:var(--muted)]">
              <span className="text-4xl">🎁</span>
              <p className="mt-3 text-sm">{tr(lang, "لا توجد هدايا على هذا الرقم حاليًا.", "No rewards on this number yet.")}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {rewards.map((r) => (
                <div key={r.id} className="rq-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl text-white" style={{ background: "linear-gradient(155deg,#a8371a,#661c0a)" }}>
                      {r.kind === "discount" ? "٪" : "🎁"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[16px] font-bold text-[color:var(--ink)]">
                        {r.title}{valueLabel(r) ? ` · ${valueLabel(r)}` : ""}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] font-medium text-[color:var(--muted)]">
                        {r.restaurant}{r.expires_at ? ` · ${tr(lang, "ينتهي", "ends")} ${fmtDate(r.expires_at)}` : ""}
                      </p>
                    </div>
                  </div>
                  {(r.description || r.code) && (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-[color:var(--surface-2)] px-3 py-2">
                      <span className="truncate text-sm text-[color:var(--ink)]">{r.description ?? tr(lang, "أبرز الرمز عند الطلب", "Show the code when ordering")}</span>
                      {r.code && <span dir="ltr" className="shrink-0 rounded-lg bg-brand-800 px-2.5 py-1 text-xs font-extrabold text-cream-100">{r.code}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </CustomerShell>
  );
}
