"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { checkinAction, type CheckinState, type Gift } from "./actions";
import { toAr } from "@/lib/format";
import { tr, type Lang } from "@/lib/i18n";

const PHONE_KEY = "turn:phone";

function giftLabel(g: Gift, lang: Lang): string {
  if (g.value != null && g.value_kind === "percent") return `${toAr(g.value)}${lang === "en" ? "% off" : "٪ خصم"}`;
  if (g.value != null && g.value_kind === "amount") return `${toAr(Math.round(g.value))} ${tr(lang, "ر.س", "SAR")}`;
  return g.title;
}

export function CheckinForm({ slug, lang }: { slug: string; lang: Lang }) {
  const [state, action, pending] = useActionState<CheckinState, FormData>(checkinAction, { ok: false });
  const [phone, setPhone] = useState("");

  // تعبئة الرقم المحفوظ بعد الترطيب (بلا عدم تطابق SSR)
  useEffect(() => {
    try { const p = localStorage.getItem(PHONE_KEY); if (p) setPhone(p); } catch {}
  }, []);

  // حفظ الرقم محليًا للمرّات الجاية (راحة العميل)
  useEffect(() => {
    if (state.ok && state.phone) {
      try { localStorage.setItem(PHONE_KEY, state.phone); } catch {}
    }
  }, [state.ok, state.phone]);

  if (state.ok) {
    const g = state.gift;
    const loyal = state.loyalty;
    return (
      <div className="space-y-4">
        {/* بطاقة النجاح / الهدية */}
        <div
          className="reveal overflow-hidden rounded-3xl p-6 text-center text-cream-100"
          style={{ background: "linear-gradient(155deg,#b23c1d,#7c230f 60%,#4c1406)", boxShadow: "0 20px 40px -22px rgba(102,28,10,0.85)" }}
        >
          {g ? (
            <>
              <p className="text-sm font-bold text-cream-100/85">
                {state.is_first_visit ? tr(lang, "أهلًا فيك! هديتك الأولى", "Welcome! Your first gift") : tr(lang, "هديتك", "Your gift")}
              </p>
              <p className="mt-2 font-display text-4xl font-extrabold leading-tight">{giftLabel(g, lang)}</p>
              <p className="mt-1 text-sm font-bold text-cream-100/90">{g.title}</p>
              {g.expires_days ? (
                <p className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold ring-1 ring-white/25">
                  {tr(lang, `صالحة ${toAr(g.expires_days)} يوم — قدّمها عند الطلب`, `Valid ${toAr(g.expires_days)} days — show at checkout`)}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="font-display text-3xl font-extrabold">{tr(lang, "تم تسجيل زيارتك ✓", "You're checked in ✓")}</p>
              <p className="mt-2 text-sm font-bold text-cream-100/90">
                {state.is_recent
                  ? tr(lang, "سجّلناك قريب — استمتع بزيارتك", "Already checked in recently — enjoy your visit")
                  : tr(lang, "شكرًا لزيارتك", "Thanks for visiting")}
              </p>
            </>
          )}
        </div>

        {/* مكافأة الولاء (لو تحقّقت) */}
        {state.loyalty_reward && (
          <div className="rq-card p-4 text-center">
            <p className="font-display text-base font-bold text-[color:var(--brand-d)]">🎉 {tr(lang, "أكملت نقاط الولاء!", "Loyalty complete!")}</p>
            <p className="mt-1 text-sm font-bold text-[color:var(--ink)]">{state.loyalty_reward.title}</p>
          </div>
        )}

        {/* تقدّم الولاء */}
        {loyal && loyal.threshold > 0 && (
          <div className="rq-card p-4">
            <div className="flex items-center justify-between text-[13px] font-bold text-[color:var(--ink)]">
              <span>{tr(lang, "نقاطك", "Your points")}</span>
              <span dir="ltr">{toAr(state.points ?? 0)} / {toAr(loyal.threshold)}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(102,28,10,0.12)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.round(((state.points ?? 0) / loyal.threshold) * 100))}%`,
                  background: "linear-gradient(90deg,#b23c1d,#661c0a)",
                }}
              />
            </div>
            <p className="mt-2 text-[12px] font-bold text-[color:var(--muted)]">
              {tr(lang, `كل زيارة +${toAr(loyal.points_per_visit)} نقطة — ${toAr(Math.max(0, loyal.threshold - (state.points ?? 0)))} للمكافأة`,
                       `+${toAr(loyal.points_per_visit)} points each visit — ${toAr(Math.max(0, loyal.threshold - (state.points ?? 0)))} to reward`)}
            </p>
          </div>
        )}

        {/* محفظة العروض عبر كل المطاعم */}
        <Link
          href={`/me/rewards${state.phone ? `?phone=${encodeURIComponent(state.phone)}` : ""}`}
          className="flex items-center justify-between rounded-2xl px-4 py-3.5"
          style={{ background: "linear-gradient(160deg,#fbf1ea,#f4ddd0)", border: "1px solid rgba(102,28,10,0.16)" }}
        >
          <span className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--brand-d)" }}>
            🎁 {tr(lang, "شوف كل هداياك وعروضك", "See all your gifts & offers")}
          </span>
          <span style={{ color: "var(--brand-d)" }}>←</span>
        </Link>

        <Link href={`/r/${slug}`} className="block text-center text-[13px] font-bold text-[color:var(--muted)]">
          {tr(lang, "زيارة صفحة المطعم ←", "Visit restaurant page ←")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <div className="rq-card p-4">
        <label className="block text-[13px] font-bold text-[color:var(--ink)]">{tr(lang, "رقم جوّالك", "Your mobile")}</label>
        <input
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          dir="ltr"
          placeholder="05xxxxxxxx"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-2 w-full rounded-2xl border border-[color:var(--border)] bg-white px-4 py-3 text-center text-lg font-bold tracking-widest text-[color:var(--ink)] outline-none focus:border-[color:var(--brand-d)]"
        />
        <label className="mt-4 block text-[13px] font-bold text-[color:var(--ink)]">{tr(lang, "اسمك (اختياري)", "Your name (optional)")}</label>
        <input
          name="name"
          type="text"
          autoComplete="name"
          placeholder={tr(lang, "عشان نرحّب فيك", "So we greet you")}
          className="mt-2 w-full rounded-2xl border border-[color:var(--border)] bg-white px-4 py-3 text-[15px] font-bold text-[color:var(--ink)] outline-none focus:border-[color:var(--brand-d)]"
        />
      </div>

      {state.error && <p className="text-center text-sm font-bold text-[color:var(--st-closed)]">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl py-4 text-center font-display text-lg font-extrabold text-cream-100 transition active:scale-[0.98] disabled:opacity-60"
        style={{ background: "linear-gradient(150deg,#b23c1d,#661c0a)", boxShadow: "0 16px 30px -18px rgba(102,28,10,0.8)" }}
      >
        {pending ? tr(lang, "لحظة…", "One moment…") : tr(lang, "خذ هديتك 🎁", "Get your gift 🎁")}
      </button>
      <p className="text-center text-[12px] font-medium text-[color:var(--muted)]">
        {tr(lang, "بدون تحميل — رقمك يكفي", "No download — your number is enough")}
      </p>
    </form>
  );
}
