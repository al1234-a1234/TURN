"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CustomerShell } from "@/components/customer-shell";
import { useLang } from "@/components/lang-provider";
import { tr } from "@/lib/i18n";
import { getTurns, type TurnRecord } from "@/lib/local-store";

export default function DiariesPage() {
  const lang = useLang();
  const [turns, setTurns] = useState<TurnRecord[] | null>(null);

  useEffect(() => {
    const sync = () => setTurns(getTurns());
    sync();
    window.addEventListener("turn:store", sync);
    return () => window.removeEventListener("turn:store", sync);
  }, []);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang === "en" ? "en-GB" : "ar-SA", { hour: "2-digit", minute: "2-digit" });

  return (
    <CustomerShell title={tr(lang, "اليوميات", "Diaries")} active="diaries" search={false}>
      {turns === null ? null : turns.length === 0 ? (
        <div className="rq-card p-10 text-center text-[color:var(--muted)]">
          <span className="text-4xl">📔</span>
          <p className="mt-3 text-sm">{tr(lang, "يومياتك ستظهر هنا بعد أول دور تأخذه.", "Your diary appears here after your first turn.")}</p>
          <Link href="/" className="rq-btn-soft mt-4 inline-flex">{tr(lang, "ابدأ الآن", "Start now")}</Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="mb-1 text-sm text-[color:var(--muted)]">{tr(lang, "سجلّ زياراتك عبر دور.", "A journal of your visits with Turn.")}</p>
          {turns.map((t, i) => {
            const initial = (t.name || "م").trim().charAt(0);
            return (
              <Link key={`${t.slug}-${i}`} href={`/r/${t.slug}`} className="rq-card flex items-center gap-3 p-4 transition active:scale-[0.99]">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-800 font-serif text-lg font-bold text-cream-100">
                  {t.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.logo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initial
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[15px] font-bold text-[color:var(--ink)]">{t.name}</p>
                  <p className="mt-0.5 text-[13px] font-medium text-[color:var(--muted)]">{fmt(t.at)} · {fmtTime(t.at)}</p>
                </div>
                <span className="text-lg">🍽️</span>
              </Link>
            );
          })}
        </div>
      )}
    </CustomerShell>
  );
}
