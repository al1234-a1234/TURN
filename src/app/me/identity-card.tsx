"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMe, getTurns, getBookings, clearBooking } from "@/lib/local-store";
import { clearLiveTicketCache } from "@/components/live-ticket-bar";
import { normalizePhone, toAr } from "@/lib/format";
import { fmtTime } from "@/lib/dates";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

// مخرجات الاستعلام بالرقم بعد 0104: حالةٌ بلا هويّة مكان ولا معرّف.
// المكان يأتي من ذاكرة الجهاز (`getTurns` / `getBookings`) لا من الخادم.
type Live = {
  kind: string;
  status: string;
  at: string;
  party_size: number;
  position: number | null;
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
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelErr, setCancelErr] = useState(false);

  useEffect(() => {
    const m = getMe();
    setMe(m);
    const phone = m.phone ? normalizePhone(m.phone).slice(0, 10) : "";
    if (!/^05\d{8}$/.test(phone)) return;
    let alive = true;
    fetch(`/api/my-status?phone=${phone}`)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((j) => {
        if (!alive) return;
        const rows = (j.rows ?? []) as Live[];
        setLive(rows);
        // كان الاسم يُؤخذ من الخادم هنا («أدقّ: قد يصحّحه المضيف»)، وسُحب
        // في 0104: اسمٌ يخرج مقابل رقمٍ يعرفه أيّ أحد هو التسريب نفسه.
        // والاسم المحفوظ على الجهاز يكفي — صاحبه هو من كتبه.
      });
    return () => { alive = false; };
  }, []);

  async function cancelReservation(id: string) {
    setCancelling(id);
    setCancelErr(false);
    const res = await fetch("/api/cancel-booking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, phone: me?.phone ?? "" }),
    });
    setCancelling(null);
    const j = res.ok ? await res.json() : { ok: false };
    // لا نُخفي الحجز إلّا إذا أكّدت القاعدة إلغاءه: إخفاؤه بلا تأكيد يجعل
    // العميل يظنّ أنه ألغى، فلا يأتي — والطاولة تبقى محجوزةً عند المطعم.
    if (j.ok) {
      // الصفوف لم تعد تحمل معرّفًا، فنُسقط الحجز بموعده — والجهاز ينسى سجلّه
      const gone = getBookings().find((b) => b.id === id)?.at;
      setLive((cur) => (cur ?? []).filter((r) => !(r.kind === "reservation" && r.at === gone)));
      clearBooking(id);
      // وإلّا بقي الشريط المتنقّل يعرض حجزًا ألغاه صاحبه حتى تنتهي مهلته
      clearLiveTicketCache();
    } else setCancelErr(true);
  }

  // الصفحة مُولَّدة مسبقًا، والاسم والرقم يُقرآن من الجهاز بعد الترطيب. فلو
  // رجعنا null لرأى صاحب الحساب صفحةً خاوية ثم تمتلئ — ووميضُ «ما عندي شيء»
  // في التبويب الذي فتحه ليطمئنّ على دوره أسوأ من انتظارٍ ساكن.
  if (!me) {
    return (
      <div className="mb-5">
        <div className="rq-card grid place-items-center p-6" aria-hidden>
          <div className="h-16 w-16 rounded-full" style={{ background: "var(--surface-2)" }} />
          <div className="mt-3 h-6 w-40 rounded-lg" style={{ background: "var(--surface-2)" }} />
          <div className="mt-2 h-4 w-28 rounded-lg" style={{ background: "var(--surface-2)" }} />
        </div>
      </div>
    );
  }

  const known = Boolean(me.name || me.phone);
  const initial = me.name?.trim()?.[0] ?? "";

  return (
    <div className="mb-5">
      <div className={`rq-card p-6${known ? " text-center" : ""}`}>
        {known ? (
          <>
            {/* الاسم والرقم في وسط البطاقة تحت حرفه الأوّل — هذه هي «أنا»
                في الصفحة، ومركزُها يقولها. وكانا مصفوفين إلى الحافّة فيقرآن
                سطرَ بيانٍ في نموذج، لا رأسَ حسابٍ لصاحبه. */}
            <span
              className="mx-auto grid h-16 w-16 place-items-center rounded-full"
              style={{ background: "var(--brand-solid)" }}
              aria-hidden
            >
              {initial ? (
                <span className="font-display text-2xl font-bold text-cream-100">{initial}</span>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-cream-100">
                  <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.9" />
                  <path d="M4.8 20c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              )}
            </span>
            <p className="mt-3 font-display text-xl font-bold text-[color:var(--ink)]">
              {me.name || tr(lang, "أهلًا بك", "Welcome")}
            </p>
            {me.phone && (
              <p dir="ltr" className="mt-1 text-[15px] font-bold tabular-nums text-[color:var(--muted)]">
                {me.phone}
              </p>
            )}
            <p className="mx-auto mt-3 max-w-xs text-[12px] font-bold leading-5" style={{ color: "var(--st-open)" }}>
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
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/" className="rq-btn-soft inline-flex">
                {tr(lang, "تصفّح المطاعم ←", "Browse restaurants ←")}
              </Link>
              {/* جهازٌ جديد أو تخزينٌ ممسوح: له دورٌ وحجز على رقمه، ولا شيء
                  هنا يدلّه عليهما. ورقمُه يُحفظ عند أوّل بحث، فلا يُسأل بعدها. */}
              <Link href="/me/bookings" className="rq-btn-soft inline-flex">
                {tr(lang, "عندي دور أو حجز برقمي", "I have a turn or booking")}
              </Link>
            </div>
          </>
        )}
      </div>

      {/* التذكرة كاملةً هنا — لا شريطًا يقود إلى صفحةٍ أخرى.
          العميل يفتح «حسابي» ليرى دوره أو حجزه ويتصرّف فيه: يفتح تذكرة
          دوره، أو يلغي حجزًا لن يحضره. وصفحةٌ ثانية بينهما تُبقي طاولةً
          محجوزةً لمن لن يأتي لمجرّد أن الإلغاء كان بعيدًا خطوة. */}
      {live?.map((r, i) => {
        const isTurn = r.kind === "turn";
        // المكان من الجهاز: الدور من آخر تذكرةٍ محفوظة، والحجز بمطابقة الموعد.
        const mine = isTurn
          ? getTurns().find((t) => t.entryId) ?? null
          : getBookings().find((b) => b.at === r.at) ?? null;
        const bookingId = !isTurn && mine && "id" in mine ? mine.id : null;
        return (
          <div key={`${r.kind}-${r.at}-${i}`} className="rq-card mt-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <span
                className="shrink-0 rounded-full px-3 py-1 text-[11px] font-extrabold text-cream-100"
                style={{ background: isTurn ? "var(--brand-solid)" : "var(--st-open)" }}
              >
                {isTurn ? tr(lang, "دورك", "Your turn") : tr(lang, "حجزك", "Your booking")}
              </span>
              <div className="min-w-0 flex-1 text-end">
                {mine ? (
                  <Link href={`/r/${mine.slug}`} className="block truncate font-display text-lg font-bold text-[color:var(--ink)]">
                    {mine.name}
                  </Link>
                ) : (
                  // جهازٌ جديد: نعرض الحالة بلا مكان بدل أن نكشفه لمن يعرف الرقم
                  <p className="block truncate font-display text-lg font-bold text-[color:var(--ink)]">
                    {isTurn ? tr(lang, "دورٌ قائم", "An active turn") : tr(lang, "حجزٌ قائم", "An active booking")}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: "var(--surface-2)" }}>
              <span className="text-sm font-bold" style={{ color: "var(--brand-d)" }}>
                {isTurn
                  ? tr(lang, `ترتيبك ${toAr(r.position ?? 0)}`, `You're #${r.position ?? 0}`)
                  : fmtTime(r.at, lang)}
              </span>
              <span className="text-[13px] font-bold text-[color:var(--muted)]">
                {tr(lang, `${toAr(r.party_size)} أشخاص`, `${r.party_size} guests`)}
              </span>
            </div>

            {isTurn ? (
              mine ? (
                <Link href={`/r/${mine.slug}`} className="btn btn-primary mt-3 w-full">
                  {tr(lang, "افتح تذكرتي", "Open my ticket")}
                </Link>
              ) : null
            ) : bookingId ? (
              <button
                onClick={() => cancelReservation(bookingId)}
                disabled={cancelling === bookingId}
                className="mt-3 w-full rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-50"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--danger)" }}
              >
                {cancelling === bookingId ? tr(lang, "…") : tr(lang, "إلغاء الحجز", "Cancel booking")}
              </button>
            ) : (
              // جهازٌ لا يحمل هذا الحجز: الإلغاء يحتاج إثبات حيازةٍ لا معرفة رقم
              <p className="mt-3 text-center text-[12px] text-[color:var(--muted)]">
                {tr(lang, "للإلغاء افتح الرابط من جهازك الذي حجزت به، أو اتّصل بالمطعم.",
                    "To cancel, open the link on the device you booked with, or call the restaurant.")}
              </p>
            )}
          </div>
        );
      })}

      {/* لا شيء حيًّا الآن — ونقولها بدل أن نترك فراغًا. الفراغ لا يُفرَّق
          عن عطل: صاحب الدور يقرؤه «ضاع دوري». و«live === null» غير هذا:
          يعني لم نسأل بعدُ أو تعذّر السؤال، فلا ندّعي فيه شيئًا. */}
      {known && live?.length === 0 && (
        <div className="rq-card mt-3 p-6 text-center">
          <p className="text-2xl">🍽️</p>
          <p className="mt-1 font-bold text-[color:var(--ink)]">
            {tr(lang, "ما عندك دور ولا حجز حاليًّا", "No active turn or booking")}
          </p>
          <Link href="/" className="rq-btn-soft mt-3 inline-flex">
            {tr(lang, "تصفّح المطاعم ←", "Browse restaurants ←")}
          </Link>
        </div>
      )}

      {cancelErr && (
        <p className="mt-2 px-1 text-[13px] font-bold" style={{ color: "var(--danger)" }}>
          {tr(lang, "تعذّر الإلغاء — جرّب بعد لحظات، أو اتّصل بالمطعم.", "Couldn't cancel — try again shortly, or call the restaurant.")}
        </p>
      )}
    </div>
  );
}
