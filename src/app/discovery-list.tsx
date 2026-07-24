"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toAr } from "@/lib/format";
import { tr, type Lang } from "@/lib/i18n";
import type { DiscoveryOffer } from "@/lib/supabase/public-cache";

function offerBadge(o: DiscoveryOffer, lang: Lang): string {
  if (o.kind === "percent" && o.value != null) return `${toAr(o.value)}${lang === "en" ? "%" : "٪"}`;
  if (o.kind === "fixed" && o.value != null) return `${toAr(Math.round(o.value))} ${tr(lang, "ر.س", "SAR")}`;
  if (o.kind === "points" && o.value != null) return `×${toAr(o.value)}`;
  if (o.kind === "free_item") return tr(lang, "مجاني", "Free");
  if (o.kind === "bogo") return "1+1";
  return "★";
}

function OffersRail({ offers, lang }: { offers: DiscoveryOffer[]; lang: Lang }) {
  if (offers.length === 0) return null;
  return (
    <section>
      <div className="mb-2 mt-1 flex items-center gap-2 px-1">
        <span className="h-4 w-1 rounded-full" style={{ background: "var(--brand-d)" }} />
        <h2 className="font-display text-[15px] font-bold text-[color:var(--brand-d)]">{tr(lang, "عروض حيّة", "Live offers")}</h2>
        <span className="text-[12px] font-bold text-[color:var(--muted)]">{toAr(offers.length)}</span>
      </div>
      <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {offers.map((o) => {
          const initial = (o.restaurant.name ?? "").trim().charAt(0) || "م";
          return (
            <Link
              key={o.id}
              href={`/r/${o.restaurant.slug}`}
              className="flex w-[172px] shrink-0 flex-col gap-2 rounded-2xl bg-white p-3 transition active:scale-[0.98]"
              style={{ border: "1px solid rgba(102,28,10,0.12)", boxShadow: "0 8px 18px -16px rgba(102,28,10,0.4)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="rounded-xl px-2.5 py-1 font-display text-sm font-extrabold text-white"
                  style={{ background: "linear-gradient(150deg,#b23c1d,#661c0a)" }}
                >
                  {offerBadge(o, lang)}
                </span>
                {o.code && (
                  <span dir="ltr" className="truncate rounded-md px-1.5 py-0.5 text-[10px] font-extrabold" style={{ color: "var(--brand-d)", background: "rgba(102,28,10,0.08)" }}>{o.code}</span>
                )}
              </div>
              <p className="line-clamp-2 text-[13px] font-bold leading-snug text-[color:var(--ink)]">{o.title}</p>
              <div className="mt-auto flex items-center gap-1.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-800 font-serif text-[9px] font-bold text-cream-100">
                  {o.restaurant.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.restaurant.logo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initial
                  )}
                </span>
                <span className="truncate text-[11px] font-bold text-[color:var(--muted)]">{o.restaurant.name}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export type DiscoveryItem = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cuisine: string | null;
  cuisine_en: string | null;
  city: string;
  lat: number | null;
  lng: number | null;
  waiting: number;
  inside: number;
  outside: number;
  accepts: boolean;
  rating: string | null;
};

// مسافة هافرساين بالمتر
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function distanceLabel(m: number, lang: Lang): string {
  if (m < 1000) return tr(lang, `${toAr(Math.round(m / 10) * 10)} م`, `${Math.round(m / 10) * 10} m`);
  const km = m / 1000;
  const v = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  return tr(lang, `${toAr(v)} كم`, `${v} km`);
}

function ZonePill({ label, count, lang }: { label: string; count: number; lang: Lang }) {
  const busy = count > 0;
  return (
    <span
      className="inline-flex w-[116px] items-center justify-between rounded-full px-3 py-1.5 text-[12px] font-bold"
      style={
        busy
          ? { background: "linear-gradient(150deg,#b23c1d,#661c0a)", color: "#fff" }
          : { background: "linear-gradient(160deg,#faefe8,#f4ddd0)", color: "var(--brand-d)", border: "1px solid rgba(102,28,10,0.14)" }
      }
    >
      <span className="inline-flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 10h16M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3M7 14v4M17 14v4M4 14h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {label}
      </span>
      <span className="font-extrabold">{busy ? toAr(count) : tr(lang, "متاح", "—")}</span>
    </span>
  );
}

function Card({ r, lang, delay, coords }: { r: DiscoveryItem; lang: Lang; delay: number; coords: { lat: number; lng: number } | null }) {
  const initial = (r.name ?? "").trim().charAt(0) || "م";
  const dist =
    coords && r.lat != null && r.lng != null
      ? distanceLabel(distanceMeters(coords, { lat: r.lat, lng: r.lng }), lang)
      : null;
  return (
    <Link
      href={`/r/${r.slug}`}
      className="reveal rq-card block overflow-hidden p-3 transition active:scale-[0.985]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-800 font-serif text-xl font-bold text-cream-100">
          {r.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.logo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-bold text-[color:var(--ink)]">{r.name}</p>
          <p className="mt-0.5 truncate text-[12px] font-medium text-[color:var(--muted)]">
            {tr(lang, r.cuisine ?? "مطعم", r.cuisine_en ?? "Restaurant")}{r.city ? ` · ${r.city}` : ""}
          </p>
          {dist && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: "var(--brand-d)" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              {tr(lang, `يبعد ${dist}`, `${dist} away`)}
            </p>
          )}
        </div>

        {r.rating && (
          <span className="flex shrink-0 items-center gap-1 self-start text-[14px] font-extrabold text-[color:var(--ink)]">
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
        <div className="mt-2.5 flex flex-col items-end gap-1.5">
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

export function DiscoveryList({ items, offers = [], lang }: { items: DiscoveryItem[]; offers?: DiscoveryOffer[]; lang: Lang }) {
  const [cuisine, setCuisine] = useState<string>("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // موقع العميل لعرض المسافة (بإذنه) — يُطلب مرّة، والرفض لا يؤثّر
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }, []);

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

  const selected = cuisines.find((c) => c.ar === cuisine);
  const selectedLabel = selected ? tr(lang, selected.ar, selected.en ?? selected.ar) : "";

  const chip = (active: boolean) =>
    active
      ? { background: "linear-gradient(160deg,#a8371a,#661c0a)", color: "#fff", border: "1px solid transparent" }
      : { background: "linear-gradient(160deg,#fbf1ea,#f4ddd0)", color: "var(--brand-d)", border: "1px solid rgba(102,28,10,0.14)" };

  let delay = 0;

  return (
    <div className="space-y-4">
      {/* شريط العروض الحيّة — بارز أعلى الشاشة */}
      <OffersRail offers={offers} lang={lang} />

      {/* تصفية المطابخ — زر يفتح الخيارات */}
      {cuisines.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setFilterOpen((o) => !o)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold transition active:scale-95"
            style={chip(cuisine !== "")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {cuisine ? selectedLabel : tr(lang, "تصفية", "Filter")}
            {cuisine ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setCuisine(""); setFilterOpen(false); }}
                className="ms-0.5 grid h-4 w-4 place-items-center rounded-full bg-white/25 text-[11px] leading-none"
              >
                ✕
              </span>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden style={{ transform: filterOpen ? "rotate(180deg)" : "none" }}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          {filterOpen && (
            <>
              <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setFilterOpen(false)} />
              <div
                className="absolute z-20 mt-2 flex max-h-72 w-[min(20rem,85vw)] flex-wrap gap-2 overflow-y-auto rounded-3xl bg-white p-3 shadow-xl"
                style={{ border: "1px solid rgba(102,28,10,0.12)" }}
              >
                <button
                  onClick={() => { setCuisine(""); setFilterOpen(false); }}
                  className="rounded-full px-3.5 py-1.5 text-[13px] font-bold transition active:scale-95"
                  style={chip(cuisine === "")}
                >
                  {tr(lang, "الكل", "All")}
                </button>
                {cuisines.map((c) => (
                  <button
                    key={c.ar}
                    onClick={() => { setCuisine(c.ar); setFilterOpen(false); }}
                    className="rounded-full px-3.5 py-1.5 text-[13px] font-bold transition active:scale-95"
                    style={chip(cuisine === c.ar)}
                  >
                    {tr(lang, c.ar, c.en ?? c.ar)}
                  </button>
                ))}
              </div>
            </>
          )}
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
                <Card key={r.id} r={r} lang={lang} delay={(delay++ % 8) * 45} coords={coords} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
