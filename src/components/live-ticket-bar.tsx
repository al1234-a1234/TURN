"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe, getTurns } from "@/lib/local-store";
import { normalizePhone, toAr } from "@/lib/format";
import { fmtTime } from "@/lib/dates";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

// 0130: الاستعلام بالرقم عاد يُرجع اسم المطعم ومعرّفه العلني — قرار
// المشغّل الصريح بعد أن أنتج إخفاء 0104 بطاقة «دورٌ قائم» بلا اسمٍ حكم
// عليها «ما في فايدة». الاسم الشخصي يبقى مخفيًّا والحدود المركّبة قائمة.
type Live = {
  kind: string;
  status: string;
  at: string;
  position: number | null;
  party_size: number | null;
  venue_name: string | null;
  venue_slug: string | null;
};

const CACHE_KEY = "live-ticket";
// ١٥ث لا ٦٠: كانت هذي المهلة تعني أن إزالة الموظّف من الاستقبال (شاشته هو
// سريعة) لا تصل شريط العميل الجالس على صفحةٍ ثابتة إلا بعد دقيقة كاملة —
// شكوى المشغّل اليوم بالحرف: «التحكم عند الاستقبال سريع، لكن العكسي بطيء».
const TTL_MS = 15_000;
const POLL_MS = 12_000;

/** يُنادى بعد الإلغاء: الشريط لا يُبقي حجزًا ألغاه صاحبه دقيقةً كاملة */
export function clearLiveTicketCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* تصفّحٌ خفيّ أو تخزينٌ مقفل — لا شيء نُبطله */
  }
}

function readCache(phone: string): Live[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { phone: string; at: number; rows: Live[] };
    if (c.phone !== phone || Date.now() - c.at > TTL_MS) return null;
    return c.rows;
  } catch {
    return null;
  }
}

/**
 * تذكرتي تتنقّل معي.
 *
 * كان الدور والحجز يسكنان صفحة «حسابي» وحدها، فمن يفتح التطبيق وهو واقفٌ
 * في الطابور يرى قائمة مطاعم — لا ترتيبَه. وهو لم يفتحه ليتصفّح، بل ليطمئنّ.
 *
 * فصار شريطًا فوق الشريط السفلي في كل صفحة: اسم المطعم وترتيبك أو موعدك،
 * وضغطةٌ واحدة تفتح التذكرة. ويختفي من مكانين: صفحة «حسابي» وصفحة المطعم
 * نفسه — فالتذكرة معروضةٌ فيهما كاملةً، وتكرارها فوقها ضجيج.
 *
 * ولا يكلّف زائرًا شيئًا: بلا رقمٍ محفوظ لا يسأل الخادم أصلًا، ومع الرقم
 * يسأل مرّةً كل دقيقة مهما تنقّل بين الصفحات.
 */
export function LiveTicketBar({ onShow }: { onShow?: (shown: boolean) => void }) {
  const lang = useLang();
  const path = usePathname();
  const [rows, setRows] = useState<Live[] | null>(null);

  useEffect(() => {
    let alive = true;

    const load = (force: boolean) => {
      const p = getMe().phone ? normalizePhone(getMe().phone!).slice(0, 10) : "";
      // زائرٌ لم يأخذ دورًا قطّ: لا رقم ⇒ لا نداء. وهم أكثر من يفتح الرئيسية.
      if (!/^05\d{8}$/.test(p)) return;

      if (!force) {
        const cached = readCache(p);
        if (cached) { setRows(cached); return; }
      }

      fetch(`/api/my-status?phone=${p}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!alive || !j) return;
          const fresh = (j.rows ?? []) as Live[];
          setRows(fresh);
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ phone: p, at: Date.now(), rows: fresh }));
          } catch {
            /* التخزين مقفل — نكتفي بالحالة في الذاكرة */
          }
        })
        .catch(() => {
          /* فشلٌ عابر: لا شريط، ولا رسالة خطأ فوق كل صفحة */
        });
    };

    load(false);

    // رجوع سفاري من ذاكرة الصفحات (bfcache) لا يعيد تشغيل شيء: الصفحة
    // ترجع بحالتها القديمة كاملةً، فكان الشريط يعرض دورًا أُلغي قبل لحظات
    // — «ألغيت وخرجت ولا يزال كاتب إني حاجز». الرجوع المحفوظ يسأل من جديد
    // متجاوزًا الكاش، وعودة التبويب للواجهة تسأل باحترام مهلة الدقيقة.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) load(true); };
    const onVisible = () => { if (!document.hidden) load(false); };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);

    // نبضةٌ خفيفة أثناء الجلوس على صفحةٍ واحدة بلا أي تنقّل: بدونها كان
    // الشريط لا يعرف أن الاستقبال أزال صاحبه إلا حين يغادر التبويب ويعود.
    // تتوقّف عند خمول التبويب فلا تستهلك شيئًا في الخلفية.
    const timer = setInterval(() => { if (!document.hidden) load(true); }, POLL_MS);

    return () => {
      alive = false;
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [path]);

  // الدور قبل الحجز: الدور يجري الآن، والحجز موعدٌ لاحق
  const row = rows?.find((r) => r.kind === "turn") ?? rows?.[0] ?? null;

  // 0130: الاسم والمعرّف من الخادم مع الصفّ نفسه — دقيقان لكل صفّ ويعملان
  // من أي جهاز. ذاكرة الجهاز تبقى احتياطًا (نسخةٌ قديمة من الاستجابة مثلًا).
  const localTurn = row?.kind === "turn" ? getTurns().find((t) => t.entryId) ?? null : null;
  const venueName = row?.venue_name ?? localTurn?.name ?? null;
  const venueSlug = row?.venue_slug ?? localTurn?.slug ?? null;

  // معروضةٌ كاملةً في هذين المكانين — فلا تُعاد مصغّرةً فوقهما
  const hidden = !row || path === "/me" || (venueSlug ? path === `/r/${venueSlug}` : false);

  useEffect(() => { onShow?.(!hidden); }, [hidden, onShow]);

  if (hidden) return null;

  const isTurn = row.kind === "turn";
  return (
    <Link
      href={isTurn && venueSlug ? `/r/${venueSlug}` : "/me"}
      className="mb-2 flex items-center gap-3 rounded-3xl px-4 py-3 shadow-lg transition active:scale-[0.99]"
      style={{ background: "var(--brand-solid)" }}
    >
      <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-extrabold text-cream-100">
        {isTurn ? tr(lang, "دورك", "Your turn") : tr(lang, "حجزك", "Your booking")}
      </span>
      <span className="min-w-0 flex-1 text-end">
        <span className="block truncate text-sm font-extrabold text-cream-100">
          {venueName ?? (isTurn ? tr(lang, "دورك محفوظ", "Your turn is saved") : tr(lang, "حجزك محفوظ", "Your booking is saved"))}
        </span>
        <span className="block truncate text-[12px] font-bold text-cream-100/85">
          {isTurn
            ? tr(lang, `ترتيبك ${toAr(row.position ?? 0)}`, `You're #${row.position ?? 0}`)
            : fmtTime(row.at, lang)}
        </span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-cream-100/80" aria-hidden>
        <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
