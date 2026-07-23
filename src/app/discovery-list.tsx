"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toAr } from "@/lib/format";
import { tr, type Lang } from "@/lib/i18n";

export type DiscoveryItem = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cuisine: string | null;
  cuisine_en: string | null;
  city: string;
  waiting: number;
  inside: number;
  outside: number;
  accepts: boolean;
  rating: string | null;
};

function ZonePill({ label, count, lang }: { label: string; count: number; lang: Lang }) {
  const busy = count > 0;
  return (
    <span
      className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
      style={
        busy
          ? { background: "linear-gradient(155deg,#b23c1d,#661c0a)", boxShadow: "0 10px 20px -14px rgba(102,28,10,0.7)" }
          : { background: "linear-gradient(160deg,#faefe8,#f4ddd0)", border: "1px solid rgba(102,28,10,0.14)" }
      }
    >
      <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: busy ? "#fff" : "var(--brand-d)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: busy ? "#fff" : "var(--brand-d)" }}>
          <path d="M4 10h16M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3M7 14v4M17 14v4M4 14h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {label}
      </span>
      <span className="text-sm font-extrabold" style={{ color: busy ? "#fff" : "var(--brand-d)" }}>
        {busy ? tr(lang, `${toAr(count)} بالطابور`, `${toAr(count)} in queue`) : tr(lang, "متاح", "Available")}
      </span>
    </span>
  );
}

function Card({ r, lang, delay }: { r: DiscoveryItem; lang: Lang; delay: number }) {
  const initial = (r.name ?? "").trim().charAt(0) || "م";
  return (
    <Link
      href={`/r/${r.slug}`}
      className="reveal rq-card block overflow-hidden p-3 transition active:scale-[0.985]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-800 font-serif text-2xl font-bold text-cream-100">
          {r.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.logo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] font-bold text-[color:var(--ink)]">{r.name}</p>
          <p className="mt-0.5 truncate text-[13px] font-medium text-[color:var(--muted)]">
            {tr(lang, r.cuisine ?? "مطعم", r.cuisine_en ?? "Restaurant")}{r.city ? ` · ${r.city}` : ""}
          </p>
        </div>

        {r.rating && (
          <span className="flex shrink-0 items-center gap-1 self-start text-[15px] font-extrabold text-[color:var(--ink)]">
            <span style={{ color: "var(--star)" }}>★</span>
            {r.rating}
          </span>
        )}
      </div>

      {!r.accepts ? (
        <div
          className="mt-2.5 flex items-center justify-between rounded-2xl px-3.5 py-2.5"
          style={{ background: "linear-gradient(160deg,#eee7dc,#e2d8c9)", border: "1px solid rgba(45,25,15,0.10)" }}
        >
          <span className="flex items-center gap-2 text-sm font-extrabold" style={{ color: "#8a8377" }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#b3a996" }} />
            {tr(lang, "لا يستقبل الآن", "Not accepting now")}
          </span>
          <span className="text-xs font-extrabold" style={{ color: "#a89d8a" }}>{tr(lang, "التفاصيل ←", "Details ←")}</span>
        </div>
      ) : r.waiting > 0 && r.inside + r.outside > 0 ? (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <ZonePill label={tr(lang, "داخلي", "Indoor")} count={r.inside} lang={lang} />
          <ZonePill label={tr(lang, "خارجي", "Outdoor")} count={r.outside} lang={lang} />
        </div>
      ) : r.waiting > 0 ? (
        <div
          className="mt-2.5 flex items-center justify-between rounded-2xl px-3.5 py-2.5"
          style={{ background: "linear-gradient(150deg,#b23c1d,#661c0a)", boxShadow: "0 12px 24px -16px rgba(102,28,10,0.72)" }}
        >
          <span className="flex items-center gap-2 text-sm font-extrabold text-white">
            <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
            {tr(lang, `${toAr(r.waiting)} بالطابور الآن`, `${toAr(r.waiting)} in queue now`)}
          </span>
          <span className="text-xs font-extrabold text-white/85">{tr(lang, "التفاصيل ←", "Details ←")}</span>
        </div>
      ) : (
        <div
          className="mt-2.5 flex items-center justify-between rounded-2xl px-3.5 py-2.5"
          style={{ background: "linear-gradient(160deg,#fbf1ea,#f4ddd0)", border: "1px solid rgba(102,28,10,0.16)" }}
        >
          <span className="flex items-center gap-2 text-sm font-extrabold" style={{ color: "var(--brand-d)" }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--brand-d)", boxShadow: "0 0 0 3px rgba(102,28,10,0.14)" }} />
            {tr(lang, "متاح الآن · بدون انتظار", "Available now · No wait")}
          </span>
          <span className="text-xs font-extrabold" style={{ color: "var(--brand-d)" }}>{tr(lang, "خذ دورك ←", "Take your turn ←")}</span>
        </div>
      )}
    </Link>
  );
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2 mt-1 flex items-center gap-2 px-1">
      <span className="h-4 w-1 rounded-full" style={{ background: "var(--brand-d)" }} />
      <h2 className="font-display text-[15px] font-bold text-[color:var(--brand-d)]">{label}</h2>
      <span className="text-[12px] font-bold text-[color:var(--muted)]">{toAr(count)}</span>
    </div>
  );
}

export function DiscoveryList({ items, lang }: { items: DiscoveryItem[]; lang: Lang }) {
  const [cuisine, setCuisine] = useState<string>("");

  // شرائح المطابخ — مشتقّة من المطاعم المعروضة (بلا تكرار)
  const cuisines = useMemo(() => {
    const seen = new Map<string, string | null>();
    for (const r of items) {
      const c = (r.cuisine ?? "").trim();
      if (c && !seen.has(c)) seen.set(c, r.cuisine_en);
    }
    return Array.from(seen, ([ar, en]) => ({ ar, en }));
  }, [items]);

  const filtered = useMemo(
    () => (cuisine ? items.filter((r) => (r.cuisine ?? "").trim() === cuisine) : items),
    [items, cuisine],
  );

  // تجميع ذكي: متاح الآن · فيه طابور (الأقل ازدحامًا أولًا) · لا يستقبل
  const groups = useMemo(() => {
    const available = filtered.filter((r) => r.accepts && r.waiting === 0);
    const queued = filtered.filter((r) => r.accepts && r.waiting > 0).sort((a, b) => a.waiting - b.waiting);
    const closed = filtered.filter((r) => !r.accepts);
    // متاح: الأعلى تقييمًا أولًا
    available.sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
    return [
      { key: "available", label: tr(lang, "متاح الآن · بدون انتظار", "Available now · No wait"), rows: available },
      { key: "queued", label: tr(lang, "فيه طابور الآن", "Queue running now"), rows: queued },
      { key: "closed", label: tr(lang, "لا يستقبل حاليًا", "Not accepting now"), rows: closed },
    ].filter((g) => g.rows.length > 0);
  }, [filtered, lang]);

  const chip = (active: boolean) =>
    active
      ? { background: "linear-gradient(160deg,#a8371a,#661c0a)", color: "#fff", border: "1px solid transparent" }
      : { background: "linear-gradient(160deg,#fbf1ea,#f4ddd0)", color: "var(--brand-d)", border: "1px solid rgba(102,28,10,0.14)" };

  let delay = 0;

  return (
    <div className="space-y-4">
      {/* شرائح المطابخ */}
      {cuisines.length > 0 && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setCuisine("")}
            className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-bold transition active:scale-95"
            style={chip(cuisine === "")}
          >
            {tr(lang, "الكل", "All")}
          </button>
          {cuisines.map((c) => (
            <button
              key={c.ar}
              onClick={() => setCuisine(c.ar)}
              className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-bold transition active:scale-95"
              style={chip(cuisine === c.ar)}
            >
              {tr(lang, c.ar, c.en ?? c.ar)}
            </button>
          ))}
        </div>
      )}

      {/* الأقسام المجمّعة */}
      {groups.length === 0 ? (
        <div className="rq-card p-10 text-center text-[color:var(--muted)]">
          <p className="text-sm">{tr(lang, "لا توجد مطاعم بهذا التصنيف.", "No restaurants in this category.")}</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <SectionHeading label={g.label} count={g.rows.length} />
            <div className="space-y-2.5">
              {g.rows.map((r) => (
                <Card key={r.id} r={r} lang={lang} delay={(delay++ % 8) * 45} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
