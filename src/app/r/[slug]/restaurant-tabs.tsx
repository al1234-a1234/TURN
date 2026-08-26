"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { IconBell } from "@/components/icons";
import { money } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { fmtDate } from "@/lib/dates";
import { useLang } from "@/components/lang-provider";
import { isFavorite, toggleFavorite } from "@/lib/local-store";
import { SmartImage } from "@/components/smart-image";
import { Gallery } from "./gallery";

type Photo = { id: string; url: string; caption: string | null };
type BranchContent = { categories: Category[]; items: Item[]; photos: Photo[] };

/**
 * تبديل الفرع بلا إعادة توليد الصفحة.
 *
 * كان `waitlist-form` يستدعي `router.replace(?branch=…)` فيُعيد الخادم بناء
 * الصفحة كاملة لأجل منيو الفرع وصوره. وقراءة `searchParams` هي ما كانت تمنع
 * توليد الصفحة مسبقًا — أي أن كل مسحة باركود تدفع ثمن ميزةٍ نادرة الاستعمال.
 * الآن الصفحة تُولَّد مسبقًا بمنيو الفرع الأول، والتبديل يجلب منيو الفرع
 * المطلوب وحده من ‎/api/branch-content/<id>.
 */
const SelectBranchCtx = createContext<((branchId: string) => void) | null>(null);
export const useSelectBranch = () => useContext(SelectBranchCtx);

type Item = {
  id: string;
  name: string;
  name_en?: string | null;
  description_en?: string | null;
  price: number | null;
  description: string | null;
  image_url: string | null;
  category_id: string;
};
type Category = { id: string; name: string; name_en?: string | null };

/* الترجمة تُعرض إن وُجدت، وإلّا فالعربية — لا الفراغ.
   مطعمٌ ترجم نصف قائمته يعرض النصف مترجَمًا والنصف كما هو، ولا يرى
   العميل الإنجليزي سطرًا خاليًا مكان طبق. */
const pick = (lang: string, ar: string, en?: string | null) =>
  lang === "en" && en && en.trim() ? en : ar;
// خام لا منسّق: التنسيق يحتاج اللغة، وهي هنا في المتصفّح لا على الخادم
type Review = { name: string | null; stars: number; created_at: string; text: string };

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
  slug,
  name,
  nameEn,
  cuisine,
  cuisineEn,
  description,
  rating,
  reviewCount,
  reviews,
  reviewForm,
  dist,
  city,
  cover,
  logo,
  initial,
  categories: seedCategories,
  items: seedItems,
  photos: seedPhotos,
  children,
}: {
  slug: string;
  name: string;
  nameEn: string | null;
  cuisine: string | null;
  cuisineEn: string | null;
  description: string | null;
  rating: string;
  reviewCount: string;
  reviews: Review[];
  reviewForm?: React.ReactNode;
  dist: { s: number; pct: number }[];
  city: string;
  cover: string | null;
  logo: string | null;
  initial: string;
  categories: Category[];
  items: Item[];
  photos: Photo[];
  children: React.ReactNode;
}) {
  const lang = useLang();

  // محتوى الفرع المعروض: يبدأ بما وُلّد مسبقًا (الفرع الأول) ويُستبدل عند
  // التبديل. وباشتقاق الأسماء القديمة من الحالة يبقى بقيّة المكوّن كما هو.
  const [content, setContent] = useState<BranchContent>({
    categories: seedCategories, items: seedItems, photos: seedPhotos,
  });
  const { categories, items, photos } = content;

  // آخر طلبٍ هو الفائز: ضغطتان سريعتان على فرعين كانتا ستتسابقان، فيحطّ
  // الردّ الأبطأ فوق الأحدث ويعرض منيو فرعٍ غير المختار.
  const reqRef = useRef(0);
  const selectBranch = useCallback((branchId: string) => {
    const mine = ++reqRef.current;
    if (!branchId) {
      setContent({ categories: seedCategories, items: seedItems, photos: seedPhotos });
      return;
    }
    fetch(`/api/branch-content/${branchId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((c: BranchContent) => { if (mine === reqRef.current) setContent(c); })
      // فشلٌ عابر يُبقي المعروض على حاله — لا نُفرِغ منيو المطعم أمام العميل
      .catch(() => {});
  }, [seedCategories, seedItems, seedPhotos]);

  const [tab, setTab] = useState<Tab>("waitlist");
  // فتح تبويب من الرابط (?tab=reviews مثلًا) — «قيّم تجربتك» بعد المسح كان
  // يهبط على نموذج الانضمام ويترك العميل يبحث بنفسه في أعلى لحظة حماس.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "reviews" || t === "menu" || t === "media" || t === "waitlist") setTab(t as Tab);
  }, []);
  const [openCat, setOpenCat] = useState<string | null>(categories[0]?.id ?? null);
  // تبديل الفرع يجلب أقسامًا بمعرّفات جديدة — بلا هذه المزامنة تظهر القائمة كلها مطوية
  useEffect(() => {
    if (!openCat || !categories.some((c) => c.id === openCat)) setOpenCat(categories[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  // بطاقة تفاصيل الصنف: الوصف في القائمة مقصوص بسطرين والصورة مصغّرة —
  // الضغط على الصنف يفتح ورقة سفلية بالصورة الكاملة والوصف غير المقصوص،
  // والضغط على الصورة يكبّرها ملء الشاشة (نفس عارض الميديا).
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [itemZoom, setItemZoom] = useState(false);
  useEffect(() => {
    if (!openItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (itemZoom) setItemZoom(false);
      else setOpenItem(null);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openItem, itemZoom]);
  // الورقة السفلية هي شاشة القراءة الفعلية — فيها يقرأ العميل الوصف كاملًا.
  // فلو تُرجم الصنف في القائمة وحدها، لغيّر النصُّ لغته بمجرّد الضغط عليه.
  const openItemName = openItem ? pick(lang, openItem.name, openItem.name_en) : "";
  const openItemDesc = openItem ? pick(lang, openItem.description ?? "", openItem.description_en) : "";
  const hasMenu = categories.length > 0;

  // متابعة = إضافة للمفضّلة (تخزين محلّي للضيف)
  const [fav, setFav] = useState(false);
  useEffect(() => setFav(isFavorite(slug)), [slug]);
  const onFollow = () => setFav(toggleFavorite({ slug, name, logo }));

  // اسم الانتقال المشترك انتقل للشعار الكبير أعلى الصفحة (r/[slug]/page.tsx) —
  // هو الوجهة البصرية الآن، فلا نكرّره هنا لتفادي تعارض أسماء الانتقال.
  // بلاطة بيضاء بحدٍّ شعرة — نفس بلاطة بطاقة الرئيسية. كانت `bg-brand-800`
  // فيخرج كل شعارٍ بشفافيّة مصبوغًا بعنابيّنا، والشعار يضعه صاحب المطعم.
  // وهذا هو الموضع الذي كان يجعل الشعار نفسه يبدو مطعمين مختلفين بين
  // الرئيسية وصفحة المطعم.
  const LogoBox = ({ size }: { size: string }) => (
    // دائرة لا مربّع: الشعار الدائري كان يظهر داخل مربّعٍ بزواياه وفراغه
    // (شكوى مباشرة بلقطة شاشة) — دائرةٌ كدائرة الشعار الكبير أعلى الصفحة.
    <span
      className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-white font-serif text-2xl font-bold`}
      style={{ border: "1px solid var(--border)", color: "var(--brand-solid)" }}
    >
<SmartImage src={logo} fallbackText={initial} alt="" width={72} height={72} sizes="72px" className="h-full w-full object-cover" />
    </span>
  );

  return (
    <SelectBranchCtx.Provider value={selectBranch}>
    <div>
      {/* المربّعات الأربعة */}
      <div className="rq-card mb-5 grid grid-cols-4 gap-2.5 p-2.5">
        <button className="rq-tile" data-active={tab === "waitlist"} onClick={() => setTab("waitlist")}>
          <IcWait /><span className="rq-tile-label">{tr(lang, "الانتظار", "Waitlist")}</span>
        </button>
        <button className="rq-tile" data-active={tab === "menu"} onClick={() => setTab("menu")}>
          <IcMenu /><span className="rq-tile-label">{tr(lang, "القائمة", "Menu")}</span>
        </button>
        <button className="rq-tile" data-active={tab === "reviews"} onClick={() => setTab("reviews")}>
          <IcReviews /><span className="rq-tile-label">{tr(lang, "التقييمات", "Reviews")}</span>
        </button>
        <button className="rq-tile" data-active={tab === "media"} onClick={() => setTab("media")}>
          <IcMedia /><span className="rq-tile-label">{tr(lang, "ميديا", "Media")}</span>
        </button>
      </div>

      {/* ===== الانتظار ===== */}
      <div className={tab === "waitlist" ? "space-y-4" : "hidden"}>
        {/* بطاقة تعريف */}
        <div className="rq-card flex items-center gap-4 p-4">
          <LogoBox size="h-[92px] w-[92px]" />
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate font-display text-xl font-bold text-[color:var(--ink)]">{name}</p>
            <p className="mt-0.5 text-sm text-[color:var(--muted)]">{tr(lang, cuisine ?? "مطعم", cuisineEn ?? "Restaurant")}</p>
            <p className="mt-1 flex items-center justify-end gap-1 text-sm font-extrabold text-[color:var(--ink)]">
              {rating} <span style={{ color: "var(--star)" }}>★</span>
            </p>
          </div>
        </div>

        {/* صورة الغلاف */}
        {cover && (
          <div className="overflow-hidden rounded-[22px]">
            <SmartImage src={cover} fallbackText={initial} alt="" width={828} height={416} sizes="(max-width: 640px) 100vw, 640px" className="h-52 w-full object-cover" />
          </div>
        )}


        {/* المدينة + الترحيب */}
        <div className="pt-1 text-center">
          {city && <p className="font-display text-2xl font-bold text-[color:var(--ink)]">{city}</p>}
          <p className="mt-1 text-lg font-bold" style={{ color: "var(--brand-d)" }}>{tr(lang, "حيّاك الله", "Welcome")}</p>
        </div>

        {/* لوحة أخذ الدور */}
        {children}
      </div>

      {/* ===== القائمة ===== */}
      <div className={tab === "menu" ? "" : "hidden"}>
        {!hasMenu ? (
          <div className="rq-card p-8 text-center text-sm text-[color:var(--muted)]">{tr(lang, "لا توجد قائمة بعد.", "No menu yet.")}</div>
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
                    <span className="font-display text-lg font-bold text-[color:var(--ink)]">{pick(lang, cat.name, cat.name_en)}</span>
                  </button>
                  {isOpen && list.length > 0 && (
                    <ul>
                      {list.map((it) => (
                        <li key={it.id} className="border-t border-[color:var(--border)]">
                          <button
                            type="button"
                            onClick={() => { setItemZoom(false); setOpenItem(it); }}
                            className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition active:scale-[0.99] active:bg-[color:var(--surface-2)]"
                          >
                            <span className="h-[76px] w-[76px] shrink-0 overflow-hidden rounded-2xl bg-[color:var(--surface-2)]">
                              {it.image_url && (
                                <SmartImage src={it.image_url} fallbackText={pick(lang, it.name, it.name_en)} alt="" width={96} height={96} sizes="96px" className="h-full w-full object-cover" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1 text-right">
                              <p className="font-bold text-[color:var(--ink)]">{pick(lang, it.name, it.name_en)}</p>
                              {pick(lang, it.description ?? "", it.description_en) && (
                                <p className="mt-0.5 line-clamp-2 text-[13px] leading-6 text-[color:var(--muted)]">{pick(lang, it.description ?? "", it.description_en)}</p>
                              )}
                            </div>
                            {it.price != null && (
                              <span className="shrink-0 whitespace-nowrap text-sm font-extrabold text-brand-700">
                                {money(it.price, lang)}
                              </span>
                            )}
                          </button>
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

      {/* ورقة تفاصيل الصنف */}
      {openItem && !itemZoom && (
        <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal>
          <button type="button" aria-label={tr(lang, "إغلاق", "Close")} className="absolute inset-0 cursor-default bg-black/45" onClick={() => setOpenItem(null)} />
          <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-[30px] bg-[color:var(--surface)] px-5 pb-8 pt-3 shadow-2xl">
            <span className="mx-auto mb-4 block h-1 w-11 rounded-full bg-[rgba(102,28,10,0.18)]" />
            {openItem.image_url && (
              <button
                type="button"
                onClick={() => setItemZoom(true)}
                className="relative block w-full overflow-hidden rounded-3xl transition active:scale-[0.99]"
                aria-label={tr(lang, "تكبير الصورة", "Zoom image")}
              >
                <SmartImage src={openItem.image_url} fallbackText={openItemName} alt={openItemName} width={828} height={621} sizes="(max-width: 640px) 100vw, 640px" className="aspect-[4/3] w-full object-cover" />
                <span className="absolute end-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-sm text-cream-100">⤢</span>
              </button>
            )}
            <div className="mt-4 flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-right font-display text-xl font-bold text-[color:var(--ink)]">{openItemName}</p>
              {/* السعر بيانٌ عاديّ لا حالةٌ استثنائية — نصٌّ ملوّن لا كبسولة */}
              {openItem.price != null && (
                <span className="shrink-0 whitespace-nowrap text-[17px] font-bold tabular-nums" style={{ color: "var(--brand-solid)" }}>
                  {money(openItem.price, lang)}
                </span>
              )}
            </div>
            {openItemDesc && (
              <p className="mt-2 whitespace-pre-line text-right text-[15px] leading-8 text-[color:var(--muted)]">{openItemDesc}</p>
            )}
            <button type="button" onClick={() => setOpenItem(null)} className="btn btn-primary mt-6 w-full">
              {tr(lang, "إغلاق", "Close")}
            </button>
          </div>
        </div>
      )}

      {/* عارض صورة الصنف ملء الشاشة */}
      {openItem && itemZoom && openItem.image_url && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal
          onClick={() => setItemZoom(false)}
        >
          <button
            type="button"
            onClick={() => setItemZoom(false)}
            className="absolute end-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-xl text-cream-100"
            aria-label={tr(lang, "إغلاق", "Close")}
          >
            ✕
          </button>
          <figure className="max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <SmartImage src={openItem.image_url} fallbackText={openItemName} alt={openItemName} width={1080} height={1080} sizes="100vw" className="max-h-[80vh] w-full rounded-2xl object-contain" />
            <figcaption className="mt-3 text-center text-sm font-bold text-cream-100/90">{openItemName}</figcaption>
          </figure>
        </div>
      )}

      {/* ===== التقييمات ===== */}
      <div className={tab === "reviews" ? "space-y-4" : "hidden"}>
        {reviewForm}
        {/* ملخّص + توزيع النجوم */}
        <div className="rq-card flex items-center gap-5 p-5">
          <div className="shrink-0 text-center">
            <p className="font-display text-5xl font-bold text-[color:var(--ink)] leading-none">{rating}</p>
            <p className="mt-1 text-sm"><Stars n={Math.round(Number(rating) || 0)} /></p>
            <p className="mt-1 text-xs text-[color:var(--muted)]">{reviewCount} {tr(lang, "تقييم", "reviews")}</p>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            {dist.map((d) => (
              <div key={d.s} className="flex items-center gap-2">
                <span className="w-3 text-xs font-bold text-[color:var(--muted)]">{d.s}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                  <span className="block h-full rounded-full" style={{ width: `${d.pct}%`, background: "var(--star)" }} />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* التعليقات — حقيقية */}
        {reviews.length === 0 ? (
          <div className="rq-card p-8 text-center text-[color:var(--muted)]">
            <span className="text-3xl">⭐</span>
            <p className="mt-2 text-sm">{tr(lang, "لا توجد تقييمات بعد.", "No reviews yet.")}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {reviews.map((rv, i) => (
              <li key={i} className="rq-card p-5">
                <div className="flex items-center gap-3">
                  {/* قرصٌ عنابيٌّ مُشبَع يتكرّر مع كل مراجعة يصنع عمودًا من
                      الضجيج. نفس لغة البلاطة: سطحٌ محايد وحرفٌ بلون الهوية. */}
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-base font-bold"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--brand-solid)" }}
                  >
                    {(rv.name ?? tr(lang, "عميل", "Customer")).charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1 text-right">
                    <p className="font-bold text-[color:var(--ink)]">{rv.name ?? tr(lang, "عميل", "Customer")}</p>
                    <p className="mt-0.5 text-xs text-[color:var(--muted)]">{fmtDate(rv.created_at, lang)}</p>
                  </div>
                  <span className="shrink-0 text-sm"><Stars n={rv.stars} /></span>
                </div>
                {rv.text && <p className="mt-3 text-[14px] leading-7 text-[color:var(--muted)]">{rv.text}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ===== ميديا ===== */}
      <div className={tab === "media" ? "space-y-4" : "hidden"}>
        <div className="rq-card flex items-center gap-4 p-4">
          <LogoBox size="h-[92px] w-[92px]" />
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate font-display text-xl font-bold text-[color:var(--ink)]">{name}</p>
            <p className="mt-0.5 text-sm text-[color:var(--muted)]">{tr(lang, cuisine ?? "مطعم", cuisineEn ?? "Restaurant")}</p>
            <p className="mt-1 text-sm font-bold text-brand-700">{reviewCount} {tr(lang, "تقييم", "reviews")}{Number(reviewCount) > 0 ? ` · ${rating}★` : ""}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onFollow}
          className={fav ? "rq-btn-soft" : "rq-btn"}
          aria-pressed={fav}
        >
          {fav ? tr(lang, "❤️ في المفضّلة — إلغاء المتابعة", "❤️ Following — Unfollow") : tr(lang, "متابعة", "Follow")}
        </button>
        {description && (
          <div className="rq-card p-5 text-right text-[14px] leading-7 text-[color:var(--muted)]">{description}</div>
        )}
        {nameEn && (
          <p className="text-center text-sm text-[color:var(--muted)]" dir="ltr">{nameEn}</p>
        )}
        <div className="rq-card p-8 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-cream-100" style={{ background: "var(--brand-solid)" }}><IconBell size={24} /></span>
          <p className="font-bold text-[color:var(--ink)]">{tr(lang, "تابع المطعم", "Follow the restaurant")}</p>
          <p className="mt-1 text-sm leading-6 text-[color:var(--muted)]">
            {tr(lang, "تظهر في مفضّلتك للوصول السريع لقائمته وطابوره وهداياه من جهازك.", "Saved to your favorites for quick access to its menu, queue and gifts from this device.")}
          </p>
        </div>
      </div>

      {/* المعرض انتقل إلى هنا: صوره تتبع الفرع المختار، ومالك الحالة
          واحدٌ الآن بدل أن تتفرّق على شقيقين في الصفحة. */}
      <Gallery photos={photos} />
    </div>
    </SelectBranchCtx.Provider>
  );
}
