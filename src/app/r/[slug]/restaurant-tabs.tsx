"use client";

import { useState } from "react";

type Item = {
  id: string;
  name: string;
  price: number | null;
  description: string | null;
  image_url: string | null;
  category_id: string;
};
type Category = { id: string; name: string };
type Review = { name: string; stars: string; when: string; city: string };

const DEMO_REVIEWS: Review[] = [
  { name: "نورة الجلال", stars: "٤٫٥", when: "٠٦ يونيو ٢٠٢٦", city: "الرياض" },
  { name: "ديما", stars: "٥٫٠", when: "٣٠ مايو ٢٠٢٦", city: "الرياض" },
  { name: "ريم", stars: "٥٫٠", when: "٠١ مايو ٢٠٢٦", city: "الرياض" },
  { name: "روان", stars: "٥٫٠", when: "١٢ يناير ٢٠٢٦", city: "الرياض" },
  { name: "ندى", stars: "٥٫٠", when: "٠٣ يناير ٢٠٢٦", city: "الرياض" },
  { name: "عبدالله بهلول", stars: "٥٫٠", when: "٢٨ ديسمبر ٢٠٢٥", city: "بريدة" },
];

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
                            <span className="shrink-0 text-sm font-extrabold text-brand-700" dir="ltr">
                              SAR {Number(it.price).toFixed(1)}
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
      <div className={tab === "reviews" ? "" : "hidden"}>
        <div className="rq-card p-5">
          <div className="mb-4 border-b border-[color:var(--border)] pb-4 text-right">
            <h3 className="font-display text-xl font-bold text-[color:var(--ink)]">التقييمات</h3>
            <p className="mt-1 text-sm text-[color:var(--muted)]">بالاعتماد على {reviewCount} تقييم</p>
            <p className="mt-1 flex items-center justify-end gap-2 text-lg font-extrabold text-[color:var(--ink)]">
              <span style={{ color: "var(--star)" }}>★★★★★</span> {rating}
            </p>
          </div>
          <ul className="divide-y divide-[color:var(--border)]">
            {DEMO_REVIEWS.map((rv, i) => (
              <li key={i} className="flex items-center gap-3 py-3.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--sage)] font-display text-base font-bold text-brand-800">
                  {rv.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1 text-right">
                  <p className="font-bold text-[color:var(--ink)]">{rv.name}</p>
                  <p className="mt-0.5 text-xs text-[color:var(--muted)]">{rv.city} • {rv.when}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-sm font-extrabold text-[color:var(--ink)]">
                  {rv.stars} <span style={{ color: "var(--star)" }}>★</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
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
        <p className="py-6 text-center text-sm text-[color:var(--muted)]">لا توجد منشورات بعد</p>
      </div>
    </div>
  );
}
