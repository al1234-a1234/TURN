"use client";

import { useState } from "react";
import { money } from "@/lib/format";

type Item = {
  id: string;
  name: string;
  price: number | null;
  description: string | null;
  image_url: string | null;
  category_id: string;
};
type Category = { id: string; name: string };
type Review = { name: string; stars: number; when: string; city: string; text: string };

const DEMO_REVIEWS: Review[] = [
  { name: "نورة الجلال", stars: 5, when: "06 يونيو 2026", city: "الرياض", text: "الأكل ممتاز والمكان أنيق، وأخذ الدور بالتطبيق وفّر علي وقفة طويلة. رجعت أكثر من مرة." },
  { name: "ديما", stars: 5, when: "30 مايو 2026", city: "الرياض", text: "تجربة راقية والخدمة سريعة. الإشعار وصلني قبل دوري بدقايق فوصلت بالضبط." },
  { name: "خالد", stars: 4, when: "01 مايو 2026", city: "الرياض", text: "الطعم حلو والانتظار كان أقل من المتوقع، بس أتمنى الطاولات الخارجية تزيد." },
  { name: "روان", stars: 5, when: "12 يناير 2026", city: "الرياض", text: "من أنظف وأرتب المطاعم اللي جربتها، والأجواء هادية ومريحة." },
  { name: "ندى", stars: 4, when: "03 يناير 2026", city: "الرياض", text: "المكان جميل والأسعار معقولة. زحمة يوم الخميس بس الطابور كان منظّم." },
  { name: "عبدالله بهلول", stars: 3, when: "28 ديسمبر 2025", city: "بريدة", text: "الأكل كويس عمومًا، بس الطلب تأخر شوي في وقت الذروة." },
];
// توزيع النجوم (5 ← 1)
const DIST_BARS: { s: number; pct: number }[] = [
  { s: 5, pct: 74 }, { s: 4, pct: 18 }, { s: 3, pct: 6 }, { s: 2, pct: 1 }, { s: 1, pct: 1 },
];
const Stars = ({ n }: { n: number }) => (
  <span style={{ color: "var(--star)" }}>
    {"★".repeat(n)}
    <span style={{ color: "var(--border)" }}>{"★".repeat(5 - n)}</span>
  </span>
);

type Tab = "waitlist" | "menu" | "reviews" | "media";

/* أيقونات المربّعات */
function IcWait() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="8" cy="8" r="3" /><circle cx="16.5" cy="9.5" r="2.3" />
      <path d="M2 19c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2v.6H2V19z" />
      <path d="M15 14.2c2.6.2 4.5 2 4.5 4.8v.6H17.2" />
    </svg>
  );
}
function IcMenu() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2.4" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="12" cy="9" r="2" fill="currentColor" />
      <path d="M8 14h8M8 17h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function IcReviews() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 5h10a2 2 0 012 2v4a2 2 0 01-2 2H8l-4 3V5z" />
      <path d="M20 9v6a2 2 0 01-2 2h-2l-2 2v-3" opacity=".55" />
    </svg>
  );
}
function IcMedia() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2.4" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" />
      <path d="M5 17l4-4 3 3 3-3 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function RestaurantTabs({
  name,
  nameEn,
  cuisine,
  description,
  rating,
  reviewCount,
  likes,
  distanceKm,
  city,
  cover,
  logo,
  initial,
  queueTotal,
  categories,
  items,
  children,
}: {
  name: string;
  nameEn: string | null;
  cuisine: string;
  description: string | null;
  rating: string;
  reviewCount: string;
  likes: string;
  distanceKm: string;
  city: string;
  cover: string | null;
  logo: string | null;
  initial: string;
  queueTotal: string;
  categories: Category[];
  items: Item[];
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("waitlist");
  const [openCat, setOpenCat] = useState<string | null>(categories[0]?.id ?? null);
  const hasMenu = categories.length > 0;

  const LogoBox = ({ size }: { size: string }) => (
    <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-800 font-serif text-2xl font-bold text-cream-100`}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );

  return (
    <div>
      {/* المربّعات الأربعة */}
      <div className="rq-card mb-5 grid grid-cols-4 gap-2.5 p-2.5">
        <button className="rq-tile" data-active={tab === "waitlist"} onClick={() => setTab("waitlist")}>
          <IcWait /><span className="rq-tile-label">الانتظار</span>
        </button>
        <button className="rq-tile" data-active={tab === "menu"} onClick={() => setTab("menu")} disabled={!hasMenu}>
          <IcMenu /><span className="rq-tile-label">القائمة</span>
        </button>
        <button className="rq-tile" data-active={tab === "reviews"} onClick={() => setTab("reviews")}>
          <IcReviews /><span className="rq-tile-label">التقييمات</span>
        </button>
        <button className="rq-tile" data-active={tab === "media"} onClick={() => setTab("media")}>
          <IcMedia /><span className="rq-tile-label">ميديا</span>
        </button>
      </div>

      {/* ===== الانتظار ===== */}
      <div className={tab === "waitlist" ? "space-y-4" : "hidden"}>
        {/* بطاقة تعريف */}
        <div className="rq-card flex items-center gap-4 p-4">
          <LogoBox size="h-[92px] w-[92px]" />
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate font-display text-xl font-bold text-[color:var(--ink)]">{name}</p>
            <p className="mt-0.5 text-sm text-[color:var(--muted)]">{cuisine}</p>
            <p className="mt-1 flex items-center justify-end gap-1 text-sm font-extrabold text-[color:var(--ink)]">
              {rating} <span style={{ color: "var(--star)" }}>★</span>
            </p>
          </div>
        </div>

        {/* صورة الغلاف */}
        {cover && (
          <div className="overflow-hidden rounded-[22px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" className="h-52 w-full object-cover" />
          </div>
        )}

        {/* إعجابات + مسافة */}
        <div className="flex items-center justify-between px-2">
          <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--like)" }}>
            {likes}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.3-9C1 8.5 3 5 6.5 5 8.7 5 10 6.3 12 8.4 14 6.3 15.3 5 17.5 5 21 5 23 8.5 21.3 12 19 16.5 12 21 12 21z" /></svg>
          </span>
          <span className="flex items-center gap-1.5 text-sm font-bold text-[color:var(--ink)]">
            {distanceKm} كم
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-brand-600"><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="2" /></svg>
          </span>
        </div>

        {/* المدينة + الترحيب */}
        <div className="pt-1 text-center">
          {city && <p className="font-display text-2xl font-bold text-[color:var(--ink)]">{city}</p>}
          <p className="mt-1 text-lg font-bold" style={{ color: "var(--st-open)" }}>حيّاك الله</p>
        </div>

        {/* لوحة أخذ الدور */}
        {children}
      </div>

      {/* ===== القائمة ===== */}
      <div className={tab === "menu" ? "" : "hidden"}>
        {!hasMenu ? (
          <div className="rq-card p-8 text-center text-sm text-[color:var(--muted)]">لا توجد قائمة بعد.</div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => {
              const list = items.filter((i) => i.category_id === cat.id);
              const isOpen = openCat === cat.id;
              return (
                <div key={cat.id} className="rq-card overflow-hidden">
                  <button
                    onClick={() => setOpenCat(isOpen ? null : cat.id)}
                    className="flex w-full items-center justify-between px-5 py-4"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={`text-brand-600 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="font-display text-lg font-bold text-[color:var(--ink)]">{cat.name}</span>
                  </button>
                  {isOpen && list.length > 0 && (
                    <ul>
                      {list.map((it) => (
                        <li key={it.id} className="flex items-center gap-3 border-t border-[color:var(--border)] px-4 py-3.5">
                          <span className="h-[76px] w-[76px] shrink-0 overflow-hidden rounded-2xl bg-[color:var(--surface-2)]">
                            {it.image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={it.image_url} alt="" className="h-full w-full object-cover" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1 text-right">
                            <p className="font-bold text-[color:var(--ink)]">{it.name}</p>
                            {it.description && (
                              <p className="mt-0.5 line-clamp-2 text-[13px] leading-6 text-[color:var(--muted)]">{it.description}</p>
                            )}
                          </div>
                          {it.price != null && (
                            <span className="shrink-0 whitespace-nowrap text-sm font-extrabold text-brand-700">
                              {money(it.price)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== التقييمات ===== */}
      <div className={tab === "reviews" ? "space-y-4" : "hidden"}>
        {/* ملخّص + توزيع النجوم */}
        <div className="rq-card flex items-center gap-5 p-5">
          <div className="shrink-0 text-center">
            <p className="font-display text-5xl font-bold text-[color:var(--ink)] leading-none">{rating}</p>
            <p className="mt-1 text-sm"><Stars n={5} /></p>
            <p className="mt-1 text-xs text-[color:var(--muted)]">{reviewCount} تقييم</p>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            {DIST_BARS.map((d) => (
              <div key={d.s} className="flex items-center gap-2">
                <span className="w-3 text-xs font-bold text-[color:var(--muted)]">{d.s}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                  <span className="block h-full rounded-full" style={{ width: `${d.pct}%`, background: "var(--star)" }} />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* التعليقات */}
        <ul className="space-y-3">
          {DEMO_REVIEWS.map((rv, i) => (
            <li key={i} className="rq-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--sage)] font-display text-base font-bold text-brand-800">
                  {rv.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1 text-right">
                  <p className="font-bold text-[color:var(--ink)]">{rv.name}</p>
                  <p className="mt-0.5 text-xs text-[color:var(--muted)]">{rv.city} • {rv.when}</p>
                </div>
                <span className="shrink-0 text-sm"><Stars n={rv.stars} /></span>
              </div>
              <p className="mt-3 text-[14px] leading-7 text-[color:var(--muted)]">{rv.text}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* ===== ميديا ===== */}
      <div className={tab === "media" ? "space-y-4" : "hidden"}>
        <div className="rq-card flex items-center gap-4 p-4">
          <LogoBox size="h-[92px] w-[92px]" />
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate font-display text-xl font-bold text-[color:var(--ink)]">{name}</p>
            <p className="mt-0.5 text-sm text-[color:var(--muted)]">{cuisine}</p>
            <p className="mt-1 text-sm font-bold text-brand-700">المتابعون {reviewCount}</p>
          </div>
        </div>
        <button className="rq-btn">متابعة</button>
        {description && (
          <div className="rq-card p-5 text-right text-[14px] leading-7 text-[color:var(--muted)]">{description}</div>
        )}
        {nameEn && (
          <p className="text-center text-sm text-[color:var(--muted)]" dir="ltr">{nameEn}</p>
        )}
        <div className="rq-card p-8 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--sage)] text-2xl">🔔</span>
          <p className="font-bold text-[color:var(--ink)]">تابع المطعم</p>
          <p className="mt-1 text-sm leading-6 text-[color:var(--muted)]">
            يوصلك جديد العروض والأصناف والأوقات الأقل زحمة أول بأول.
          </p>
        </div>
      </div>
    </div>
  );
}
