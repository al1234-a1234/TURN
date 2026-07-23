"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CustomerShell } from "@/components/customer-shell";
import { useLang } from "@/components/lang-provider";
import { tr } from "@/lib/i18n";
import { getTurns, type TurnRecord } from "@/lib/local-store";

export default function MyWaitlistPage() {
  const lang = useLang();
  const [turns, setTurns] = useState<TurnRecord[] | null>(null);

  useEffect(() => {
    const sync = () => setTurns(getTurns());
    sync();
    window.addEventListener("turn:store", sync);
    return () => window.removeEventListener("turn:store", sync);
  }, []);

  // آخر دور لكل مطعم (اشتراك واحد ظاهر لكل مطعم)
  const latest = turns
    ? Array.from(new Map(turns.map((t) => [t.slug, t])).values())
    : [];

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA", { day: "2-digit", month: "short" });

  return (
    <CustomerShell title={tr(lang, "اشتراكاتي", "My subscriptions")} active="other" search={false}>
      {turns === null ? null : latest.length === 0 ? (
        <div className="rq-card p-10 text-center text-[color:var(--muted)]">
          <span className="text-4xl">⏱️</span>
          <p className="mt-3 text-sm">{tr(lang, "لم تنضمّ إلى أي طابور بعد.", "You haven't joined any queue yet.")}</p>
          <Link href="/" className="rq-btn-soft mt-4 inline-flex">{tr(lang, "خذ دورك الآن", "Take your turn now")}</Link>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-[color:var(--muted)]">{tr(lang, "المطاعم التي أخذت فيها دورك — افتحها لمتابعة حالتك اللحظية.", "Restaurants where you took a turn — open one for its live status.")}</p>
          <div className="space-y-2.5">
            {latest.map((t) => {
              const initial = (t.name || "م").trim().charAt(0);
              return (
                <Link key={t.slug} href={`/r/${t.slug}`} className="rq-card flex items-center gap-3 p-3 transition active:scale-[0.985]">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-800 font-serif text-xl font-bold text-cream-100">
                    {t.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initial
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[16px] font-bold text-[color:var(--ink)]">{t.name}</p>
                    <p className="mt-0.5 text-[13px] font-medium text-[color:var(--muted)]">{tr(lang, "آخر دور:", "Last turn:")} {fmt(t.at)}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: "linear-gradient(155deg,#a8371a,#661c0a)" }}>{tr(lang, "الحالة ←", "Status ←")}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </CustomerShell>
  );
}
