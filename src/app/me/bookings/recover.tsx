"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getMe, saveMe, getTurns, getBookings, clearBooking } from "@/lib/local-store";
import { clearLiveTicketCache } from "@/components/live-ticket-bar";
import { normalizePhone, toAr } from "@/lib/format";
import { fmtTime } from "@/lib/dates";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

// مخرجات الاستعلام بالرقم بعد 0104: حالةٌ بلا هويّة مكان ولا معرّف —
// الموقع كان كامل جائزة المهاجم. والمكان يأتي من ذاكرة الجهاز إن عرفه.
type Row = {
  kind: string;
  status: string;
  at: string;
  party_size: number;
  position: number | null;
};

/**
 * «دوري وحجزي يضيعان إذا سكّرت المتصفّح».
 *
 * كان الاسترجاع يعتمد على التخزين المحلّي وحده — وهو يضيع بمتصفّحٍ آخر، أو
 * تصفّحٍ خفيّ، أو تثبيت التطبيق (سياق تخزينٍ جديد)، أو مسح البيانات، أو
 * جهازٍ ثانٍ. والحجز لم يكن يُحفظ أصلًا.
 *
 * وهويّة العميل رقمُه لا جهازُه. فهذه الشاشة تسأل الرقم وتُرجع كل شيء من
 * الخادم. والتخزين المحلّي يبقى مسارًا سريعًا: نملأ الرقم منه ونبحث فورًا،
 * فلا يكتب شيئًا في الحالة الغالبة.
 */
export function RecoverBookings() {
  const lang = useLang();
  const [phone, setPhone] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelErr, setCancelErr] = useState(false);
  // الحقل مخفيٌّ لمن رقمه معروف: سؤاله عمّا نعرفه يُشعره أن شيئًا ضاع
  const [editing, setEditing] = useState(false);

  const lookup = useCallback(async (p: string) => {
    if (!/^05\d{8}$/.test(p)) return;
    setBusy(true);
    const res = await fetch(`/api/my-status?phone=${p}`);
    setBusy(false);
    // فشلٌ عابر ≠ «ما عندك شيء»: null يعني لم نعرف، والواجهة تفرّق
    if (!res.ok) { setRows(null); return; }
    const j = await res.json();
    setRows((j.rows ?? []) as Row[]);
    saveMe({ phone: p });
  }, []);

  // الرقم محفوظ من آخر مرّة ⇒ يظهر جاهزًا بلا كتابة
  useEffect(() => {
    const me = getMe();
    const p = me.phone ? normalizePhone(me.phone).slice(0, 10) : "";
    setPhone(p);
    // بلا رقمٍ محفوظ وحده يُفتح الحقل — وإلا فالصفحة تعرض النتيجة مباشرةً
    if (!/^05\d{8}$/.test(p)) setEditing(true);
  }, []);

  // ويبحث بمجرّد اكتمال الرقم — سواءٌ جاء من الذاكرة أو كتبه الآن.
  //
  // كان يشترط ضغط «ابحث»، فيكتب العميل رقمه ويبقى ينظر إلى «اكتب رقمك»
  // وهو كاتبه. زرٌّ لشيءٍ بديهيّ ليس خيارًا، بل عقبة.
  useEffect(() => {
    if (!/^05\d{8}$/.test(phone)) { setRows(null); return; }
    const t = setTimeout(() => lookup(phone), 350);
    return () => clearTimeout(t);
  }, [phone, lookup]);

  async function cancelReservation(id: string) {
    setCancelling(id);
    // عبر خادمنا لا مباشرةً: نداء RPC من متصفّح كان يرجع 405 صامتًا، فيضغط
    // العميل «إلغاء» ولا يحدث شيء — ويبقى الحجز قائمًا وهو يحسبه ملغى.
    const res = await fetch("/api/cancel-booking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, phone }),
    });
    setCancelling(null);
    const j = res.ok ? await res.json() : { ok: false };
    if (j.ok) {
      // الصفوف بلا معرّف بعد 0104 — يُسقَط الحجز بموعده، وينسى الجهاز سجلّه
      const gone = getBookings().find((b) => b.id === id)?.at;
      setRows((cur) => (cur ?? []).filter((r) => !(r.kind === "reservation" && r.at === gone)));
      clearBooking(id);
      clearLiveTicketCache();
    } else setCancelErr(true);
  }

  const ok = /^05\d{8}$/.test(phone);

  return (
    <div className="space-y-4">
      {/* رقمه معروف ⇒ لا يُعرض هنا أصلًا: بطاقة الحساب تقوله مرّةً في
          أعلى الصفحة، وإعادته في كل قسمٍ ضجيجٌ لا خبر. والنموذج لمن لا
          رقم له وحده. */}
      {!editing && ok ? null : (
      <div className="rq-card p-5">
        <p className="field-label mb-2">{tr(lang, "رقم جوّالك", "Your mobile number")}</p>
        <p className="mb-3 text-[13px] leading-6 text-[color:var(--muted)]">
          {tr(
            lang,
            "دورك وحجزك محفوظان برقمك لا بجهازك — تلقاهما من أي جوّال، ولو سكّرت المتصفّح أو ثبّتّ التطبيق.",
            "Your turn and booking are saved to your number, not your device — find them from any phone, even after closing the browser or installing the app.",
          )}
        </p>
        <div className="flex gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 10))}
            dir="ltr"
            inputMode="numeric"
            maxLength={10}
            placeholder="05xxxxxxxx"
            className="field-input flex-1 text-left"
          />
          <button
            onClick={() => lookup(phone)}
            disabled={!ok || busy}
            className="btn btn-primary shrink-0 disabled:opacity-50"
            aria-label={tr(lang, "تحديث", "Refresh")}
          >
            {busy ? tr(lang, "…") : tr(lang, "تحديث", "Refresh")}
          </button>
        </div>
      </div>
      )}

      {rows === null && !busy && editing && (
        <p className="px-1 text-sm font-bold text-[color:var(--muted)]">
          {/* لا نقول «ما عندك شيء» ونحن لم نعرف — عميلٌ له حجز يقرؤها إلغاءً */}
          {phone.length > 0
            ? tr(lang, "أكمل رقمك (١٠ خانات) ليظهر دورك وحجزك.", "Complete your number (10 digits) to see your turn and booking.")
            : tr(lang, "اكتب رقمك لاسترجاع دورك أو حجزك.", "Enter your number to find your turn or booking.")}
        </p>
      )}

      {cancelErr && (
        <p className="px-1 text-[13px] font-bold" style={{ color: "var(--danger)" }}>
          {tr(lang, "تعذّر الإلغاء — جرّب بعد لحظات، أو اتّصل بالمطعم.", "Couldn't cancel — try again shortly, or call the restaurant.")}
        </p>
      )}

      {rows?.length === 0 && (
        <div className="rq-card p-7 text-center">
          <p className="text-2xl">🍽️</p>
          <p className="mt-2 font-bold text-[color:var(--ink)]">
            {tr(lang, "ما عندك دور ولا حجز حاليًّا", "No active turn or booking")}
          </p>
          <Link href="/restaurants" className="rq-btn-soft mt-4 inline-flex">
            {tr(lang, "تصفّح المطاعم ←", "Browse restaurants ←")}
          </Link>
        </div>
      )}

      {rows?.map((r, i) => {
        const isTurn = r.kind === "turn";
        // هذه الصفحة هي الاسترجاع بالرقم بعينه، وأكثر من يفتحها على جهازٍ
        // جديد. فالمكان قد لا يعرفه الجهاز — ونقولها بدل أن نكشفه لمن يعرف
        // الرقم. الميزة باقية: يرى أنّ له دورًا وترتيبَه فيه.
        const mine = isTurn
          ? getTurns().find((t) => t.entryId) ?? null
          : getBookings().find((b) => b.at === r.at) ?? null;
        const bookingId = !isTurn && mine && "id" in mine ? mine.id : null;
        return (
          <div key={`${r.kind}-${r.at}-${i}`} className="rq-card p-5">
            <div className="flex items-start justify-between gap-3">
              <span
                className="shrink-0 rounded-full px-3 py-1 text-[11px] font-extrabold text-cream-100"
                style={{ background: isTurn ? "var(--brand-solid)" : "var(--st-open)" }}
              >
                {isTurn ? tr(lang, "دور", "Turn") : tr(lang, "حجز", "Booking")}
              </span>
              <div className="min-w-0 flex-1 text-end">
                {mine ? (
                  <Link href={`/r/${mine.slug}`} className="block truncate font-display text-lg font-bold text-[color:var(--ink)]">
                    {mine.name}
                  </Link>
                ) : (
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
              <p className="mt-3 text-center text-[12px] text-[color:var(--muted)]">
                {tr(lang, "للإلغاء افتح الرابط من جهازك الذي حجزت به، أو اتّصل بالمطعم.",
                    "To cancel, open the link on the device you booked with, or call the restaurant.")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
