"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CheckinForm } from "./checkin-form";
import { checkinAction, type CheckinState } from "./actions";
import { RewardQr } from "@/components/reward-qr";
import { StampCard } from "@/components/stamp-card";
import { createClient } from "@/lib/supabase/client";
import { toAr, normalizePhone } from "@/lib/format";
import { tr, type Lang } from "@/lib/i18n";

/**
 * توجيه المسح الذكي — من يمسح باركود المطعم يُوجَّه حسب حالته:
 *   معروف وسبق أن زار    ← «وضعي مع هذا المطعم» + تسجيل الزيارة بضغطة واحدة
 *   جديد أو رقم لا يعرفه  ← نموذج التسجيل ذو الخطوة الواحدة (كما كان)
 * القرار يُبنى على الرقم المحفوظ محليًّا + نداء my_restaurant_status واحد.
 */

type Status = {
  known: boolean;
  name?: string | null;
  visits?: number;
  points?: number;
  tier?: string | null;
  /** اسم الطبقة وميزتها كما سمّاهما المالك (0047) — المفتاح للنظام فقط */
  tier_name?: string | null;
  tier_perk?: string | null;
  loyalty?: { points_per_visit: number; threshold: number; reward: string | null } | null;
  rewards?: Array<{
    id: string; kind: string; title: string; value: number | null;
    value_kind: string; code: string | null; expires_at: string | null; description: string | null;
  }>;
};

// لون الطبقة بالمفتاح الثابت؛ الاسم المعروض يأتي من إعداد المالك
const TIER_COLOR: Record<string, string> = { gold: "#b8860b", silver: "#7d7d85" };
const TIER_FALLBACK: Record<string, [string, string]> = { gold: ["ذهبي", "Gold"], silver: ["فضّي", "Silver"] };

export function ScanLanding({ slug, branchId, lang }: { slug: string; branchId: string; lang: Lang }) {
  const [phase, setPhase] = useState<"loading" | "form" | "status">("loading");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [checkin, setCheckin] = useState<CheckinState | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      let saved = "";
      try { saved = normalizePhone(localStorage.getItem("turn:phone") ?? "").slice(0, 10); } catch { /* تجاهُل */ }
      if (!/^05\d{8}$/.test(saved)) { if (alive) setPhase("form"); return; }
      const supabase = createClient();
      const { data, error } = await supabase.rpc("my_restaurant_status", { p_slug: slug, p_phone: saved });
      if (!alive) return;
      const s = (data ?? { known: false }) as Status;
      if (error || !s.known) { setPhase("form"); return; }
      setPhone(saved);
      setStatus(s);
      setPhase("status");
    })();
    return () => { alive = false; };
  }, [slug]);

  // تسجيل الزيارة بضغطة واحدة ثم تحديث الوضع من المصدر
  function checkinNow() {
    start(async () => {
      const fd = new FormData();
      fd.set("slug", slug); fd.set("phone", phone); fd.set("branch_id", branchId);
      const r = await checkinAction({ ok: false }, fd);
      setCheckin(r);
      if (r.ok) {
        const supabase = createClient();
        const { data } = await supabase.rpc("my_restaurant_status", { p_slug: slug, p_phone: phone });
        const s = (data ?? null) as Status | null;
        if (s?.known) setStatus(s);
      }
    });
  }

  if (phase === "loading") {
    return <div className="rq-card h-48 animate-pulse" />;
  }

  if (phase === "form" || !status) {
    return (
      <>
        <div className="mb-4 text-center">
          <h2 className="font-display text-xl font-bold text-[color:var(--ink)]">{tr(lang, "امسح خذ هديتك 🎁", "Scan & get your gift 🎁")}</h2>
          <p className="mt-1 text-sm font-medium text-[color:var(--muted)]">
            {tr(lang, "اكتب رقمك واستلم هديتك — بدون تطبيق ولا تسجيل", "Enter your number and get your gift — no app, no signup")}
          </p>
        </div>
        <CheckinForm slug={slug} branchId={branchId} lang={lang} />
      </>
    );
  }

  const firstName = (status.name ?? "").trim().split(/\s+/)[0] || null;
  const tierKey = status.tier && TIER_COLOR[status.tier] ? status.tier : null;
  const tierName = tierKey
    ? (status.tier_name || tr(lang, TIER_FALLBACK[tierKey][0], TIER_FALLBACK[tierKey][1]))
    : null;
  const loyal = status.loyalty ?? null;
  const points = status.points ?? 0;

  return (
    <div className="space-y-4">
      {/* الترحيب + الوضع */}
      <div className="rq-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-xl font-bold text-[color:var(--ink)]">
              {firstName ? tr(lang, `يا هلا ${firstName} 👋`, `Welcome back, ${firstName} 👋`) : tr(lang, "يا هلا بعودتك 👋", "Welcome back 👋")}
            </p>
            {/* العدد المسجَّل فعلًا — بعد الاعتماد يُعاد جلب الوضع فيتحدّث وحده */}
            <p className="mt-0.5 text-sm font-medium text-[color:var(--muted)]">
              {tr(lang, `${toAr(status.visits ?? 0)} زيارة معنا`, `${toAr(status.visits ?? 0)} visits with us`)}
            </p>
          </div>
          {tierKey && (
            <span className="rounded-full px-3 py-1 text-xs font-extrabold text-white" style={{ background: TIER_COLOR[tierKey] }}>
              {tierName}
            </span>
          )}
        </div>
        {tierKey && status.tier_perk && (
          <p className="mt-2 rounded-xl px-3 py-2 text-[12px] font-bold"
             style={{ background: "rgba(184,134,11,0.1)", color: "#8a6508" }}>
            👑 {tr(lang, `ميزة ${tierName}: ${status.tier_perk}`, `${tierName} perk: ${status.tier_perk}`)}
          </p>
        )}

        {/* زر الزيارة — قلب الشاشة */}
        {checkin?.ok ? (
          <div className="mt-4 rounded-2xl p-4 text-center text-cream-100"
               style={{ background: "linear-gradient(155deg,#b23c1d,#7c230f 60%,#4c1406)" }}>
            <p className="font-display text-2xl font-extrabold">
              {checkin.is_recent ? tr(lang, "مسجّل من قبل ✓", "Already checked in ✓") : tr(lang, "تسجّلت زيارتك ✓", "Visit recorded ✓")}
            </p>
            {checkin.is_recent && (
              <p className="mt-1 text-xs font-bold text-cream-100/85">{tr(lang, "سجّلناك قريب — استمتع بجلستك", "You checked in recently — enjoy")}</p>
            )}
            {(checkin.instant || checkin.gift) && (
              <p className="mt-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold">
                ⚡ {(checkin.instant ?? checkin.gift)!.title} — {tr(lang, "نزلت في هداياك تحت", "added to your gifts below")}
              </p>
            )}
            {checkin.loyalty_reward && (
              <p className="mt-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold">🎉 {checkin.loyalty_reward.title}</p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={checkinNow}
            disabled={pending}
            className="mt-4 w-full rounded-2xl py-4 text-center font-display text-lg font-extrabold text-cream-100 transition active:scale-[0.98] disabled:opacity-60"
            style={{ background: "linear-gradient(150deg,#b23c1d,#661c0a)", boxShadow: "0 16px 30px -18px rgba(102,28,10,0.8)" }}
          >
            {pending ? tr(lang, "لحظة…", "One moment…") : tr(lang, "سجّل زيارتي الآن 🎁", "Check in now 🎁")}
          </button>
        )}
        {checkin && !checkin.ok && checkin.error && (
          <p className="mt-2 text-center text-sm font-bold" style={{ color: "#c0564a" }}>{checkin.error}</p>
        )}
      </div>

      {/* بطاقة الأختام (أو الشريط للبرامج النقاطية الحرّة) */}
      {loyal && loyal.threshold > 0 && (
        <div className="rq-card p-4">
          <StampCard points={points} threshold={loyal.threshold} perVisit={loyal.points_per_visit}
                     reward={loyal.reward} lang={lang} />
        </div>
      )}

      {/* هداياه في هذا المطعم — مع الباركود القابل للمسح */}
      {(status.rewards ?? []).length > 0 && (
        <div className="space-y-2.5">
          <p className="px-1 font-display text-base font-bold text-[color:var(--ink)]">
            🎁 {tr(lang, "هداياك هنا", "Your gifts here")}
            <span className="ms-2 text-xs font-bold text-[color:var(--muted)]">{toAr((status.rewards ?? []).length)}</span>
          </p>
          {(status.rewards ?? []).map((r) => <StatusReward key={r.id} r={r} lang={lang} />)}
        </div>
      )}

      <div className="flex items-center justify-between px-1 text-[12px] font-bold">
        <Link href={`/me/rewards?phone=${encodeURIComponent(phone)}`} className="text-[color:var(--brand-d)] underline decoration-2 underline-offset-4">
          {tr(lang, "كل هداياي في كل المطاعم", "All my gifts, all restaurants")}
        </Link>
        <button
          type="button"
          className="text-[color:var(--muted)] underline decoration-2 underline-offset-4"
          onClick={() => { setStatus(null); setCheckin(null); setPhase("form"); }}
        >
          {tr(lang, "مو أنت؟ غيّر الرقم", "Not you? Change number")}
        </button>
      </div>
    </div>
  );
}

function StatusReward({ r, lang }: { r: NonNullable<Status["rewards"]>[number]; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const value =
    r.value == null ? null
    : r.value_kind === "percent" ? `${toAr(r.value)}٪`
    : `${toAr(Math.round(r.value))} ${tr(lang, "ر.س", "SAR")}`;
  return (
    <div className="rq-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg text-white"
              style={{ background: "linear-gradient(155deg,#a8371a,#661c0a)" }}>
          {r.kind === "discount" ? "٪" : "🎁"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-bold text-[color:var(--ink)]">
            {r.title}{value ? ` · ${value}` : ""}
          </p>
          {r.description && <p className="mt-0.5 truncate text-[12px] font-medium text-[color:var(--muted)]">{r.description}</p>}
        </div>
        {r.code && (
          <button type="button" onClick={() => setOpen((v) => !v)} dir="ltr"
                  className="shrink-0 rounded-lg bg-brand-800 px-2.5 py-1 text-xs font-extrabold text-cream-100">
            {r.code} <span aria-hidden>▾</span>
          </button>
        )}
      </div>
      {r.code && open && (
        <div className="mt-3 rounded-2xl bg-white p-4" style={{ border: "1px solid rgba(102,28,10,0.14)" }}>
          <RewardQr code={r.code} />
          <p dir="ltr" className="mt-2 text-center font-display text-lg font-extrabold tracking-widest text-brand-800">{r.code}</p>
          <p className="mt-1 text-center text-[11px] font-bold text-[color:var(--muted)]">
            {tr(lang, "خلّ الموظف يمسحه ويعتمد هديتك", "Let staff scan it to redeem your gift")}
          </p>
        </div>
      )}
    </div>
  );
}
