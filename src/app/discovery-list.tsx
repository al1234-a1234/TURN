"use client";

import Link from "next/link";
import { SmartImage } from "@/components/smart-image";
import { useLang } from "@/components/lang-provider";
import { storePeek } from "@/lib/peek";
import { IconPlate } from "@/components/icons";
import { useEffect, useMemo, useState } from "react";
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
  lat: number | null;
  lng: number | null;
  waiting: number;
  inside: number;
  outside: number;
  accepts: boolean;
  closedNow: boolean;
  busyNow: boolean;
  rating: string | null;
  branchCount: number;
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
          ? { background: "var(--brand-solid)", color: "var(--brand-ink)" }
          : { background: "var(--brand-solid)", color: "var(--brand-ink)" }
      }
    >
      <span className="inline-flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 10h16M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3M7 14v4M17 14v4M4 14h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {label}
      </span>
      <span className="font-extrabold">{busy ? toAr(count) : tr(lang, "متاح", "Available")}</span>
    </span>
  );
}

function Card({ r, lang, delay, coords }: { r: DiscoveryItem; lang: Lang; delay: number; coords: { lat: number; lng: number } | null }) {
  const initial = (r.name ?? "").trim().charAt(0) || "م";
  const dist =
    coords && r.lat != null && r.lng != null
      ? distanceLabel(distanceMeters(coords, { lat: r.lat, lng: r.lng }), lang)
      : null;
  const href = `/r/${r.slug}`;

  return (
    <Link
      href={href}
      onClick={() => storePeek(r.slug, { name: r.name, logo: r.logo_url, waiting: r.waiting, closed: r.closedNow })}
      className={`reveal rq-card block overflow-hidden p-3 transition active:scale-[0.985]${r.closedNow ? " opacity-70" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-800 font-serif text-xl font-bold text-cream-100">
          {r.logo_url ? (
            <SmartImage src={r.logo_url} fallbackText={r.name} alt="" width={56} height={56} sizes="56px" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-bold text-[color:var(--ink)]">{r.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] font-medium text-[color:var(--muted)]">
            <span className="truncate">
              {tr(lang, r.cuisine ?? "مطعم", r.cuisine_en ?? "Restaurant")}{r.city ? ` · ${r.city}` : ""}
            </span>
            {r.branchCount > 1 && (
              <span
                className="inline-flex shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold text-cream-100"
                style={{ background: "var(--brand-solid)" }}
              >
                {tr(lang, `${toAr(r.branchCount)} فرع`, `${r.branchCount} branches`)}
              </span>
            )}
            {r.busyNow && !r.closedNow && (
              <span
                className="inline-flex shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold text-cream-100"
                style={{ background: "var(--brand-solid)" }}
              >
                {tr(lang, "مزدحم الآن", "Busy now")}
              </span>
            )}
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

      {r.closedNow ? (
        <div
          className="mt-2.5 flex items-center justify-between rounded-2xl px-3.5 py-2.5"
          style={{ background: "var(--brand-d)" }}
        >
          <span className="flex items-center gap-2 text-sm font-extrabold text-cream-100">
            <span className="h-2.5 w-2.5 rounded-full bg-white/80" />
            {tr(lang, "مغلق حاليًا", "Closed now")}
          </span>
          <span className="text-xs font-extrabold text-cream-100/85">{tr(lang, "التفاصيل ←", "Details ←")}</span>
        </div>
      ) : r.waiting > 0 && r.inside + r.outside > 0 ? (
        <div className="mt-2.5 flex flex-col items-end gap-1.5">
          <ZonePill label={tr(lang, "داخلي", "Indoor")} count={r.inside} lang={lang} />
          <ZonePill label={tr(lang, "خارجي", "Outdoor")} count={r.outside} lang={lang} />
        </div>
      ) : r.waiting > 0 ? (
        <div
          className="mt-2.5 flex items-center justify-between rounded-2xl px-3.5 py-2.5"
          style={{ background: "var(--brand-solid)", boxShadow: "0 12px 24px -16px rgba(102,28,10,0.72)" }}
        >
          <span className="flex items-center gap-2 text-sm font-extrabold text-cream-100">
            <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
            {tr(lang, `${toAr(r.waiting)} بالطابور الآن`, `${toAr(r.waiting)} in queue now`)}
          </span>
          <span className="text-xs font-extrabold text-cream-100/85">{tr(lang, "التفاصيل ←", "Details ←")}</span>
        </div>
      ) : (
        <div
          className="mt-2.5 flex items-center justify-between rounded-2xl px-3.5 py-2.5"
          style={{ background: "var(--brand-solid)" }}
        >
          <span className="flex items-center gap-2 text-sm font-extrabold text-cream-100">
            <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
            {r.accepts
              ? tr(lang, "متاح الآن · بدون انتظار", "Available now · No wait")
              : tr(lang, "استقبال مباشر · بلا حجز دور", "Walk in directly · no queue")}
          </span>
          <span className="text-xs font-extrabold text-cream-100/85">
            {r.accepts ? tr(lang, "خذ دورك ←", "Take your turn ←") : tr(lang, "التفاصيل ←", "Details ←")}
          </span>
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

export function DiscoveryList({ items }: { items: DiscoveryItem[] }) {
  // اللغة من السياق لا من الخادم: هكذا تبقى الصفحة قابلة للتخزين على الحافة.
  const lang = useLang();
  const [cuisine, setCuisine] = useState<string>("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // موقع العميل لعرض المسافة — لا نطلب الإذن هنا أبدًا: طلبه في الرئيسية
  // كان «يحرق» نافذة السماح قبل أن يحتاجها العميل لأخذ دوره، ورفضة عابرة
  // هنا كانت تقفل بوابة الدور كلها. نقرأه فقط إن كان ممنوحًا سلفًا.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation || !navigator.permissions?.query) return;
    navigator.permissions.query({ name: "geolocation" }).then((s) => {
      if (s.state !== "granted") return;
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
      );
    }).catch(() => {});
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

  // تجميع بثلاثة أقسام: متاح الآن (يشمل مين ما عليه طابور، ومن لا يستخدم نظام
  // الطابور أصلًا — كلاهما يعني «ادخل على طول» للعميل) · فيه طابور الآن ·
  // مغلق حاليًا (يدويًا من الاستقبال أو خارج أوقات الدوام) — يظهر أخيرًا فقط
  // للتصفّح، بلا دعوة لأخذ دور.
  const groups = useMemo(() => {
    const open = filtered.filter((r) => !r.closedNow);
    const closed = filtered.filter((r) => r.closedNow);
    const available = open.filter((r) => r.waiting === 0);
    const queued = open.filter((r) => r.waiting > 0).sort((a, b) => a.waiting - b.waiting);
    // متاح: الأعلى تقييمًا أولًا
    available.sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
    return [
      { key: "available", label: tr(lang, "متاح الآن · بدون انتظار", "Available now · No wait"), rows: available },
      { key: "queued", label: tr(lang, "فيه طابور الآن", "Queue running now"), rows: queued },
      { key: "closed", label: tr(lang, "مغلق حاليًا", "Closed now"), rows: closed },
    ].filter((g) => g.rows.length > 0);
  }, [filtered, lang]);

  const selected = cuisines.find((c) => c.ar === cuisine);
  const selectedLabel = selected ? tr(lang, selected.ar, selected.en ?? selected.ar) : "";

  const chip = (active: boolean) =>
    active
      ? { background: "var(--brand-solid)", color: "var(--brand-ink)", border: "1px solid transparent" }
      : { background: "var(--brand-solid)", color: "var(--brand-ink)", border: "1px solid transparent" };

  let delay = 0;

  // حالة الفراغ انتقلت إلى هنا من الصفحة: نصُّها مترجَم، وبقاؤه على الخادم
  // كان يُلزم الصفحةَ بقراءة اللغة فتفقد قابليّة التخزين على الحافة.
  if (items.length === 0) {
    return (
      <div className="rq-card p-10 text-center text-[color:var(--muted)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-cream-100" style={{ background: "var(--brand-solid)" }}>
          <IconPlate size={26} />
        </span>
        <p className="mt-3 text-sm">{tr(lang, "لا توجد مطاعم متاحة بعد.", "No restaurants available yet.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* تصفية المطابخ — زر يفتح الخيارات */}
      {cuisines.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setFilterOpen((o) => !o)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold transition active:scale-95"
            style={chip(true)}
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
                className="absolute z-20 mt-2 flex max-h-72 w-[min(20rem,85vw)] flex-wrap gap-2 overflow-y-auto rounded-3xl bg-[color:var(--surface)] p-3 shadow-xl"
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
