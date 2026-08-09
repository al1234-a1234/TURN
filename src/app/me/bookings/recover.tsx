"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getMe, saveMe } from "@/lib/local-store";
import { normalizePhone, toAr } from "@/lib/format";
import { fmtTime } from "@/lib/dates";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

type Row = {
  kind: string;
  id: string;
  restaurant: string;
  restaurant_slug: string;
  branch: string;
  status: string;
  at: string;
  party_size: number;
  zone_name: string | null;
  position: number | null;
  table_label: string | null;
  full_name: string;
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
    const { data } = await createClient().rpc("cancel_reservation_guest", { p_id: id, p_phone: phone });
    setCancelling(null);
    if (data) setRows((cur) => (cur ?? []).filter((r) => r.id !== id));
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

      {rows?.map((r) => {
        const isTurn = r.kind === "turn";
        return (
          <div key={r.id} className="rq-card p-5">
            <div className="flex items-start justify-between gap-3">
              <span
                className="shrink-0 rounded-full px-3 py-1 text-[11px] font-extrabold text-cream-100"
                style={{ background: isTurn ? "var(--brand-solid)" : "var(--st-open)" }}
              >
                {isTurn ? tr(lang, "دور", "Turn") : tr(lang, "حجز", "Booking")}
              </span>
              <div className="min-w-0 flex-1 text-end">
                <Link href={`/r/${r.restaurant_slug}`} className="block truncate font-display text-lg font-bold text-[color:var(--ink)]">
                  {r.restaurant}
                </Link>
                <p className="truncate text-[13px] text-[color:var(--muted)]">
                  {r.branch}
                  {r.zone_name ? ` · ${r.zone_name}` : ""}
                </p>
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
                {r.table_label ? ` · ${tr(lang, `طاولة ${r.table_label}`, `Table ${r.table_label}`)}` : ""}
              </span>
            </div>

            {isTurn ? (
              <Link href={`/r/${r.restaurant_slug}`} className="btn btn-primary mt-3 w-full">
                {tr(lang, "افتح تذكرتي", "Open my ticket")}
              </Link>
            ) : (
              <button
                onClick={() => cancelReservation(r.id)}
                disabled={cancelling === r.id}
                className="mt-3 w-full rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-50"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--danger)" }}
              >
                {cancelling === r.id ? tr(lang, "…") : tr(lang, "إلغاء الحجز", "Cancel booking")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
