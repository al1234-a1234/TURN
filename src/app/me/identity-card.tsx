"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getMe, saveMe } from "@/lib/local-store";
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
  full_name: string;
};

/**
 * «أنا» في أعلى الحساب: الاسم والرقم، ومعهما ما هو حيٌّ الآن.
 *
 * كان الحساب قائمةَ روابطَ بلا صاحب — يفتحها العميل فلا يرى نفسه فيها، ولا
 * يعرف أن دوره محفوظ. والاسم والرقم مكتوبان عنده منذ أوّل دور (`saveMe`)،
 * فعرضهما هو الفرق بين «موقعٍ زرته» و«حسابٍ لي فيه شيء».
 *
 * ومن لم يأخذ دورًا بعد لا يُطالَب بتسجيل: لا حساب يُنشأ ولا كلمة مرور —
 * أوّل دورٍ يأخذه هو تسجيله.
 */
export function IdentityCard() {
  const lang = useLang();
  const [me, setMe] = useState<{ name?: string; phone?: string } | null>(null);
  const [live, setLive] = useState<Live[] | null>(null);

  useEffect(() => {
    const m = getMe();
    setMe(m);
    const phone = m.phone ? normalizePhone(m.phone).slice(0, 10) : "";
    if (!/^05\d{8}$/.test(phone)) return;
    let alive = true;
    createClient()
      .rpc("guest_status_by_phone", { p_phone: phone })
      .then(({ data, error }) => {
        if (!alive) return;
        const rows = error ? [] : ((data ?? []) as Live[]);
        setLive(rows);
        // الاسم من الخادم أدقّ: قد يكون صحّحه المضيف عند الإجلاس
        const server = rows[0]?.full_name?.trim();
        if (server && server !== m.name) {
          saveMe({ name: server });
          setMe((c) => ({ ...c, name: server }));
        }
      });
    return () => { alive = false; };
  }, []);

  if (!me) return null;

  const known = Boolean(me.name || me.phone);

  return (
    <div className="mb-5">
      <div className="rq-card p-5">
        {known ? (
          <>
            <p className="font-display text-xl font-bold text-[color:var(--ink)]">
              {me.name || tr(lang, "أهلًا بك", "Welcome")}
            </p>
            {me.phone && (
              <p dir="ltr" className="mt-0.5 text-end text-[13px] font-bold tabular-nums text-[color:var(--muted)]">
                {me.phone}
              </p>
            )}
            <p className="mt-2 text-[12px] font-bold leading-5" style={{ color: "var(--st-open)" }}>
              {tr(
                lang,
                "✓ محفوظ برقمك — دورك وحجزك يرجعان لك من أيّ جهاز",
                "✓ Saved to your number — your turn and booking follow you to any device",
              )}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-lg font-bold text-[color:var(--ink)]">
              {tr(lang, "ما عندك حساب بعد", "No account yet")}
            </p>
            {/* لا تسجيل ولا كلمة مرور: أوّل دورٍ يأخذه هو تسجيله */}
            <p className="mt-1 text-[13px] leading-6 text-[color:var(--muted)]">
              {tr(
                lang,
                "خذ دورك في أيّ مطعم، ويُحفظ اسمك ورقمك هنا تلقائيًّا. بلا تسجيل ولا كلمة مرور.",
                "Take a turn at any restaurant and your name and number are saved here automatically. No signup, no password.",
              )}
            </p>
            <Link href="/" className="rq-btn-soft mt-3 inline-flex">
              {tr(lang, "تصفّح المطاعم ←", "Browse restaurants ←")}
            </Link>
          </>
        )}
      </div>

      {/* ما هو حيٌّ الآن — أعلى الصفحة لأنه أعجل ما يبحث عنه */}
      {live?.map((r) => {
        const isTurn = r.kind === "turn";
        return (
          <Link
            key={r.id}
            href={isTurn ? `/r/${r.restaurant_slug}` : "/me/bookings"}
            className="mt-3 flex items-center gap-3 rounded-3xl p-4 transition active:scale-[0.99]"
            style={{ background: "var(--brand-solid)" }}
          >
            <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-extrabold text-cream-100">
              {isTurn ? tr(lang, "دورك", "Your turn") : tr(lang, "حجزك", "Your booking")}
            </span>
            <span className="min-w-0 flex-1 text-end">
              <span className="block truncate text-sm font-extrabold text-cream-100">{r.restaurant}</span>
              <span className="block truncate text-[12px] font-bold text-cream-100/85">
                {isTurn
                  ? tr(lang, `ترتيبك ${toAr(r.position ?? 0)}`, `You're #${r.position ?? 0}`)
                  : fmtTime(r.at, lang)}
                {r.zone_name ? ` · ${r.zone_name}` : ""}
                {r.table_label ? ` · ${tr(lang, `طاولة ${r.table_label}`, `Table ${r.table_label}`)}` : ""}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
