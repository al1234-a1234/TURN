"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
  status: string;
  expires_at: string | null;
  redeemed_at: string | null;
};

const SEEN_KEY = "turn:seen_rewards";
const readSeen = (): string[] => {
  try { return JSON.parse(window.localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; }
};

export default function MyRewardsPage() {
  const lang = useLang();
  const [phone, setPhone] = useState("");
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [pending, startRedeem] = useTransition();

  const runLookup = useCallback(async (p: string) => {
    if (!p) return;
    setLoading(true);
    try {
      window.localStorage.setItem("turn:phone", p);
      const supabase = createClient();
      const { data } = await supabase.rpc("get_customer_rewards", { p_phone: p });
      const list = (data ?? []) as Reward[];
      setRewards(list);
      // اكتشاف الجديد (نشط لم يُرَ) ثم تعليمه مقروءًا
      const seen = readSeen();
      const activeIds = list.filter((r) => r.status === "active").map((r) => r.id);
      setNewIds(new Set(activeIds.filter((id) => !seen.includes(id))));
      window.localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(new Set([...seen, ...activeIds]))));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("turn:phone") : null;
    if (saved) { setPhone(saved); runLookup(saved); }
  }, [runLookup]);

  function redeem(id: string) {
    const p = phone.trim();
    startRedeem(async () => {
      const supabase = createClient();
      const { data: ok } = await supabase.rpc("redeem_customer_reward", { p_reward_id: id, p_phone: p });
      if (ok) {
        setRewards((prev) =>
          (prev ?? []).map((r) => (r.id === id ? { ...r, status: "redeemed", redeemed_at: new Date().toISOString() } : r)),
        );
      }
    });
  }

  const valueLabel = (r: Reward) =>
    r.kind === "discount" && r.value != null
      ? r.value_kind === "amount" ? money(r.value, lang) : `${toAr(r.value)}${lang === "en" ? "%" : "٪"}`
      : "";
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-nu-latn", { day: "2-digit", month: "short" }) : "";

  const active = (rewards ?? []).filter((r) => r.status === "active");
  const used = (rewards ?? []).filter((r) => r.status === "redeemed");

  return (
    <CustomerShell title={tr(lang, "هداياي", "My rewards")} active="other" search={false}>
      <div className="space-y-5">
        <div className="rq-card p-5">
          <p className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "هداياك وخصوماتك", "Your gifts & discounts")}</p>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">{tr(lang, "محفوظة عندك برقم جوّالك — أدخله لعرضها.", "Saved to your number — enter it to view.")}</p>
          <form onSubmit={(e) => { e.preventDefault(); runLookup(phone.trim()); }} className="mt-3 flex gap-2">
            <input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" className="field-input flex-1 text-left" />
            <button type="submit" disabled={loading} className="rq-btn shrink-0 px-5">{loading ? "…" : tr(lang, "عرض", "Show")}</button>
          </form>
        </div>

        {rewards !== null && active.length === 0 && used.length === 0 && (
          <div className="rq-card p-10 text-center text-[color:var(--muted)]">
            <span className="text-4xl">🎁</span>
            <p className="mt-3 text-sm">{tr(lang, "لا توجد هدايا على هذا الرقم حاليًا.", "No rewards on this number yet.")}</p>
          </div>
        )}

        {active.length > 0 && (
          <div className="space-y-2.5">
            {active.map((r) => (
              <div key={r.id} className="rq-card p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl text-white" style={{ background: "linear-gradient(155deg,#a8371a,#661c0a)" }}>
                    {r.kind === "discount" ? "٪" : "🎁"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-display text-[16px] font-bold text-[color:var(--ink)]">
                      {r.title}{valueLabel(r) ? ` · ${valueLabel(r)}` : ""}
                      {newIds.has(r.id) && <span className="shrink-0 rounded-full bg-[color:var(--st-open)] px-2 py-0.5 text-[10px] font-extrabold text-white">{tr(lang, "جديد", "New")}</span>}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] font-medium text-[color:var(--muted)]">
                      {r.restaurant}{r.expires_at ? ` · ${tr(lang, "ينتهي", "ends")} ${fmtDate(r.expires_at)}` : ""}
                    </p>
                  </div>
                  {r.code && <span dir="ltr" className="shrink-0 rounded-lg bg-brand-800 px-2.5 py-1 text-xs font-extrabold text-cream-100">{r.code}</span>}
                </div>
                {r.description && <p className="mt-2 rounded-2xl bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--ink)]">{r.description}</p>}
                <button
                  onClick={() => redeem(r.id)}
                  disabled={pending}
                  className="rq-btn-soft mt-3 w-full"
                >
                  {tr(lang, "استخدمت الهديّة ✓", "I used it ✓")}
                </button>
              </div>
            ))}
          </div>
        )}

        {used.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-bold text-[color:var(--muted)]">{tr(lang, "مستخدمة سابقًا", "Previously used")}</p>
            <div className="space-y-2">
              {used.map((r) => (
                <div key={r.id} className="rq-card flex items-center gap-3 p-3.5 opacity-70">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--surface-2)] text-lg">✓</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[color:var(--ink)] line-through">{r.title}</p>
                    <p className="text-xs text-[color:var(--muted)]">{r.restaurant} · {tr(lang, "استُخدمت", "used")} {fmtDate(r.redeemed_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </CustomerShell>
  );
}
