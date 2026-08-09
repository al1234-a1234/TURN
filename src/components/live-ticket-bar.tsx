"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe } from "@/lib/local-store";
import { normalizePhone, toAr } from "@/lib/format";
import { fmtTime } from "@/lib/dates";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

type Live = {
  kind: string;
  id: string;
  restaurant: string;
  restaurant_slug: string;
  status: string;
  at: string;
  zone_name: string | null;
  position: number | null;
  table_label: string | null;
};

const CACHE_KEY = "live-ticket";
const TTL_MS = 60_000;

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
    const p = getMe().phone ? normalizePhone(getMe().phone!).slice(0, 10) : "";
    // زائرٌ لم يأخذ دورًا قطّ: لا رقم ⇒ لا نداء. وهم أكثر من يفتح الرئيسية.
    if (!/^05\d{8}$/.test(p)) return;

    const cached = readCache(p);
    if (cached) { setRows(cached); return; }

    let alive = true;
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
    return () => { alive = false; };
  }, [path]);

  // الدور قبل الحجز: الدور يجري الآن، والحجز موعدٌ لاحق
  const row = rows?.find((r) => r.kind === "turn") ?? rows?.[0] ?? null;

  // معروضةٌ كاملةً في هذين المكانين — فلا تُعاد مصغّرةً فوقهما
  const hidden = !row || path === "/me" || path === `/r/${row.restaurant_slug}`;

  useEffect(() => { onShow?.(!hidden); }, [hidden, onShow]);

  if (hidden) return null;

  const isTurn = row.kind === "turn";
  return (
    <Link
      href={isTurn ? `/r/${row.restaurant_slug}` : "/me"}
      className="mb-2 flex items-center gap-3 rounded-3xl px-4 py-3 shadow-lg transition active:scale-[0.99]"
      style={{ background: "var(--brand-solid)" }}
    >
      <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-extrabold text-cream-100">
        {isTurn ? tr(lang, "دورك", "Your turn") : tr(lang, "حجزك", "Your booking")}
      </span>
      <span className="min-w-0 flex-1 text-end">
        <span className="block truncate text-sm font-extrabold text-cream-100">{row.restaurant}</span>
        <span className="block truncate text-[12px] font-bold text-cream-100/85">
          {isTurn
            ? tr(lang, `ترتيبك ${toAr(row.position ?? 0)}`, `You're #${row.position ?? 0}`)
            : fmtTime(row.at, lang)}
          {row.zone_name ? ` · ${row.zone_name}` : ""}
          {row.table_label ? ` · ${tr(lang, `طاولة ${row.table_label}`, `Table ${row.table_label}`)}` : ""}
        </span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-cream-100/80" aria-hidden>
        <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
