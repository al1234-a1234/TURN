"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CustomerShell } from "@/components/customer-shell";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/lang-provider";
import { tr } from "@/lib/i18n";
import { toAr, money } from "@/lib/format";

/**
 * هدايا صاحب الحساب — المكان الوحيد الذي يرى فيه العميل هديّة.
 *
 * لا تلاحقه الهدية في صفحة المطعم وهو جاء ليأخذ دوره: يجي هنا بإرادته،
 * يضغط «استعمال» على هدية، فتُسلَّح لذلك المطعم — ثم تظهر مع دوره
 * وللاستقبال، ويعتمدها الموظّف عند التسليم.
 *
 * «استعمال» لا تصرف الهدية. لو ما جاء أو غيّر رأيه يفكّها وترجع له.
 */

type Reward = {
  id: string;
  restaurant: string;
  restaurant_slug: string;
  kind: string;
  title: string;
  value: number | null;
  value_kind: string | null;
  description: string | null;
  status: string;
  armed_at: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
};

export default function MyRewardsPage() {
  const lang = useLang();
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) { setSignedIn(false); setRewards([]); return; }
    setSignedIn(true);
    const { data } = await supabase.rpc("my_rewards");
    setRewards((data ?? []) as Reward[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** تسليح/فكّ — تفاؤلي في الواجهة، والقاعدة هي الحكم */
  const toggleArm = (r: Reward) => {
    const next = !r.armed_at;
    setBusyId(r.id);
    startTransition(async () => {
      const supabase = createClient();
      const { data: ok } = await supabase.rpc("set_reward_armed", { p_reward_id: r.id, p_arm: next });
      if (ok) {
        setRewards((prev) =>
          (prev ?? []).map((x) => (x.id === r.id ? { ...x, armed_at: next ? new Date().toISOString() : null } : x)),
        );
      }
      setBusyId(null);
    });
  };

  const valueLabel = (r: Reward) =>
    r.kind === "discount" && r.value != null
      ? r.value_kind === "amount" ? money(r.value, lang) : `${toAr(r.value)}${lang === "en" ? "%" : "٪"}`
      : "";
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-nu-latn", { day: "2-digit", month: "short" }) : "";

  const active = (rewards ?? []).filter((r) => r.status === "active");
  const used = (rewards ?? []).filter((r) => r.status === "redeemed");

  return (
    <CustomerShell active="other" search={false}>
      <div className="space-y-5">
        <div className="rq-card p-5">
          <p className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "هداياك", "Your gifts")}</p>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">
            {tr(lang, "اضغط «استعمال» على هدية، ثم خذ دورك في المطعم — تظهر للموظّف ويسلّمك إياها.",
                      "Tap “Use” on a gift, then take your turn — staff will see it and hand it to you.")}
          </p>
        </div>

        {signedIn === false && (
          <div className="rq-card p-8 text-center">
            <span className="text-4xl">🎁</span>
            <p className="mt-3 text-sm text-[color:var(--muted)]">
              {tr(lang, "هداياك محفوظة في حسابك — سجّل الدخول لعرضها.", "Your gifts live in your account — sign in to view them.")}
            </p>
            <Link href="/login" className="rq-btn mt-4 !w-auto px-8">{tr(lang, "تسجيل الدخول", "Sign in")}</Link>
          </div>
        )}

        {signedIn && rewards !== null && active.length === 0 && used.length === 0 && (
          <div className="rq-card p-10 text-center text-[color:var(--muted)]">
            <span className="text-4xl">🎁</span>
            <p className="mt-3 text-sm">{tr(lang, "ما عندك هدايا حاليًا.", "No gifts yet.")}</p>
          </div>
        )}

        {active.length > 0 && (
          <div className="space-y-2.5">
            <p className="px-1 font-display text-base font-bold text-[color:var(--ink)]">
              🎁 {tr(lang, "هدايا تقدر تستعملها", "Gifts you can use")}
              <span className="ms-2 text-xs font-bold text-[color:var(--muted)]">{toAr(active.length)}</span>
            </p>

            {active.map((r) => {
              const armed = !!r.armed_at;
              return (
                <div key={r.id} className="rq-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl text-cream-100" style={{ background: "var(--brand-solid)" }}>
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

                  {r.description && (
                    <p className="mt-2 rounded-2xl bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--ink)]">{r.description}</p>
                  )}

                  {armed ? (
                    <div className="mt-3 space-y-2">
                      <p className="rounded-2xl px-3 py-2.5 text-center text-xs font-bold text-cream-100" style={{ background: "var(--brand-solid)" }}>
                        ✓ {tr(lang, "جاهزة — خذ دورك وبتظهر للموظّف", "Ready — take your turn and staff will see it")}
                      </p>
                      <div className="flex gap-2">
                        <Link href={`/r/${r.restaurant_slug}`} className="rq-btn flex-1">{tr(lang, "خذ دورك", "Take your turn")}</Link>
                        <button type="button" onClick={() => toggleArm(r)} disabled={busyId === r.id} className="btn btn-ghost shrink-0 px-4">
                          {busyId === r.id ? "…" : tr(lang, "تراجع", "Undo")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => toggleArm(r)} disabled={busyId === r.id} className="rq-btn mt-3 w-full">
                      {busyId === r.id ? "…" : tr(lang, "استعمال", "Use")}
                    </button>
                  )}
                </div>
              );
            })}
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
