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

type Review = { name: string; stars: number; when: string; text: string };

// تقييمات تجريبية للعرض
const DEMO_REVIEWS: Review[] = [
  { name: "عبدالله ا.", stars: 5, when: "قبل ٣ أيام", text: "المكان أنيق والخدمة سريعة، أخذت دوري وطلعلي إشعار قبل لا أوصل بدقايق. تجربة مرتّبة." },
  { name: "نورة م.", stars: 5, when: "قبل أسبوع", text: "أول مرة أجرب أطلب دور بدون ما أوقف بالصف. الطعم ممتاز والأجواء هادية." },
  { name: "خالد ع.", stars: 4, when: "قبل أسبوعين", text: "الأكل حلو والانتظار كان أقل من المتوقع. بس أتمنى الطاولات الخارجية تزيد." },
  { name: "ريم س.", stars: 5, when: "قبل شهر", text: "من أنظف وأرتب المطاعم اللي جربتها، والتطبيق سهّل علي كل شي." },
];

export function RestaurantTabs({
  categories,
  items,
  rating,
  reviewCount,
  children,
}: {
  categories: Category[];
  items: Item[];
  rating: string;
  reviewCount: string;
  queueTotal?: string;
  children: React.ReactNode;
}) {
  const hasMenu = categories.length > 0;
  const [tab, setTab] = useState<"waitlist" | "menu" | "reviews">("waitlist");

  return (
    <div>
      {/* تبويبات */}
      <div className="mb-6 grid grid-cols-3 gap-1 rounded-2xl bg-[color:var(--surface-2)] p-1">
        <TabBtn active={tab === "waitlist"} onClick={() => setTab("waitlist")}>
          الانتظار
        </TabBtn>
        <TabBtn active={tab === "menu"} onClick={() => setTab("menu")} disabled={!hasMenu}>
          القائمة
        </TabBtn>
        <TabBtn active={tab === "reviews"} onClick={() => setTab("reviews")}>
          التقييمات
        </TabBtn>
      </div>

      {/* الانتظار */}
      <div className={tab === "waitlist" ? "" : "hidden"}>{children}</div>

      {/* القائمة */}
      <div className={tab === "menu" ? "" : "hidden"}>
        {!hasMenu ? (
          <div className="soft-card p-8 text-center text-sm text-[color:var(--muted)]">
            لا توجد قائمة بعد.
          </div>
        ) : (
          <div className="space-y-6">
            {categories.map((cat) => {
              const list = items.filter((i) => i.category_id === cat.id);
              if (list.length === 0) return null;
              return (
                <div key={cat.id}>
                  <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-[color:var(--ink)]">
                    <span className="h-4 w-1 rounded-full bg-brand-600" />
                    {cat.name}
                  </h3>
                  <ul className="space-y-3">
                    {list.map((it) => (
                      <li key={it.id} className="soft-card flex items-stretch gap-4 p-3">
                        <span className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-[color:var(--surface-2)]">
                          {it.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.image_url} alt="" className="h-full w-full object-cover" />
                          )}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <p className="font-bold text-[color:var(--ink)]">{it.name}</p>
                          {it.description && (
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[color:var(--muted)]">
                              {it.description}
                            </p>
                          )}
                          {it.price != null && (
                            <span className="mt-auto self-start pt-2 text-base font-extrabold text-brand-700">
                              {it.price}
                              <span className="mr-1 text-xs font-bold text-[color:var(--muted)]">ر.س</span>
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* التقييمات */}
      <div className={tab === "reviews" ? "" : "hidden"}>
        <div className="soft-card mb-4 flex items-center gap-5 p-6">
          <div className="text-center">
            <p className="font-display text-5xl font-bold text-brand-700 leading-none">{rating}</p>
            <p className="mt-2 text-sm font-bold text-brand-500">★★★★★</p>
          </div>
          <div className="h-14 w-px bg-[color:var(--border)]" />
          <div>
            <p className="font-bold text-[color:var(--ink)]">تقييم ممتاز</p>
            <p className="mt-0.5 text-sm text-[color:var(--muted)]">
              بناءً على {reviewCount} تقييم موثّق
            </p>
          </div>
        </div>

        <ul className="space-y-3">
          {DEMO_REVIEWS.map((rv, i) => (
            <li key={i} className="soft-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--sage)] font-display text-sm font-bold text-brand-800">
                    {rv.name.charAt(0)}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-[color:var(--ink)]">{rv.name}</p>
                    <p className="text-xs text-[color:var(--muted)]">{rv.when}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-brand-500">
                  {"★".repeat(rv.stars)}
                  <span className="text-[color:var(--border)]">{"★".repeat(5 - rv.stars)}</span>
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-[color:var(--muted)]">{rv.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl py-2.5 text-sm font-bold transition-all duration-200 disabled:opacity-40 ${
        active
          ? "bg-white text-brand-800 shadow-sm"
          : "text-[color:var(--muted)] hover:text-[color:var(--ink)]"
      }`}
    >
      {children}
    </button>
  );
}
