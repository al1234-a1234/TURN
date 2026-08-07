"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { bookReservationGuest, type ReserveState } from "./actions";
import { toAr, normalizePhone } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { createClient } from "@/lib/supabase/client";
import { riyadhISODate, fmtTime } from "@/lib/dates";
import { getMe, saveMe } from "@/lib/local-store";

/**
 * حجز موعدٍ لاحق.
 *
 * القاعدة كلّها هنا: لا نعرض وقتًا سيُرفض. `reservation_slots` تُرجع المواعيد
 * التي توجد فيها طاولةٌ شاغرة تكفي هذا العدد في هذا القسم — لا شبكةَ أوقاتٍ
 * جميلة يكتشف العميل عند الضغط أن نصفها كذب. ولذلك يأتي العدد والقسم قبل
 * الوقت: هما ما يحدّدان أيّ الأوقات موجودة أصلًا.
 */
type Slot = { at: string; tableId: string };

const DAYS_SHOWN = 14;

export function ReserveForm({
  slug,
  branchId,
  maxParty,
  hasInside,
  hasOutside,
}: {
  slug: string;
  branchId: string;
  maxParty: number;
  hasInside: boolean;
  hasOutside: boolean;
}) {
  const lang = useLang();
  const [state, formAction, pending] = useActionState<ReserveState, FormData>(
    bookReservationGuest,
    { ok: false },
  );

  const zoneOptions = ([hasInside && "inside", hasOutside && "outside"].filter(Boolean) as ("inside" | "outside")[]);
  const singleZone = zoneOptions.length === 1;

  const [party, setParty] = useState(2);
  // خيار «أيّهما» أُزيل: ثلاثة أزرارٍ لسؤالٍ جوابه اثنان، وأحدها لا يعني شيئًا
  // للعميل — هو يعرف أين يريد أن يجلس. والافتراضي أوّل قسمٍ يملكه الفرع.
  const [zone, setZone] = useState<"inside" | "outside">(
    () => (hasInside ? "inside" : "outside"),
  );
  const [day, setDay] = useState(() => riyadhISODate());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [savedName, setSavedName] = useState("");
  const nameRef = useRef<HTMLInputElement | null>(null);

  const cappedParty = Math.min(Math.max(party, 1), Math.max(1, maxParty));
  const effectiveZone = singleZone ? zoneOptions[0] : zone;

  // الأيام: من اليوم فصاعدًا. الأبعد ممّا يقبله المطعم يعود بقائمةٍ فارغة —
  // نافذة الحجز تعيش في القاعدة، فلا نكرّرها هنا لتتناقض معها.
  const days = useMemo(
    () => Array.from({ length: DAYS_SHOWN }, (_, i) => new Date(Date.now() + i * 86_400_000)),
    [],
  );

  useEffect(() => {
    const me = getMe();
    if (me.name) setSavedName(me.name);
    if (me.phone) setPhone((cur) => (cur ? cur : normalizePhone(me.phone!).slice(0, 10)));
  }, []);

  // جلب المواعيد المتاحة. سباق الطلبات محسوم بعدّاد: تغييرُ العدد بسرعة كان
  // يجعل ردّ الطلب الأبطأ يحطّ فوق الأحدث فتُعرض مواعيد عددٍ آخر.
  const reqRef = useRef(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!branchId) return;
    const mine = ++reqRef.current;
    setLoading(true);
    setPicked("");
    createClient()
      .rpc("reservation_slots", {
        p_branch_id: branchId,
        p_day: day,
        p_party: cappedParty,
        ...(effectiveZone ? { p_zone: effectiveZone } : {}),
      })
      .then(({ data, error }) => {
        if (mine !== reqRef.current) return;
        setLoading(false);
        // فشلٌ عابر ≠ «لا مواعيد»: null يعني لم نعرف، والواجهة تقولها
        setSlots(error ? null : (data ?? []).map((r) => ({ at: r.slot_at, tableId: r.table_id })));
      });
  }, [branchId, day, cappedParty, effectiveZone]);

  useEffect(() => {
    if (state.ok) saveMe({ name: nameRef.current?.value?.trim() || undefined, phone });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  // ===== تمّ الحجز =====
  if (state.ok) {
    return (
      <div className="rq-card p-7 text-center">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-cream-100" style={{ background: "var(--brand-solid)" }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="font-display text-xl font-bold text-[color:var(--ink)]">{tr(lang, "تمّ حجز طاولتك", "Your table is booked")}</p>
        <p className="mt-2 text-[15px] font-bold" style={{ color: "var(--brand-d)" }}>
          {state.at ? fmtTime(state.at, lang) : ""}
          {state.table ? ` · ${tr(lang, `طاولة ${state.table}`, `Table ${state.table}`)}` : ""}
        </p>
        <p className="mt-1.5 text-[13px] leading-6 text-[color:var(--muted)]">
          {tr(lang,
            `${toAr(cappedParty)} أشخاص. تعال في موعدك مباشرة — الطاولة محجوزة باسمك.`,
            `${cappedParty} guests. Come at your time — the table is held in your name.`)}
        </p>
      </div>
    );
  }

  const chosen = slots?.find((s) => s.at === picked) ?? null;
  const phoneOk = /^05\d{8}$/.test(phone);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="party_size" value={cappedParty} />
      <input type="hidden" name="zone" value={effectiveZone} />
      <input type="hidden" name="reserved_at" value={picked} />

      {/* ١) كم شخص — يسبق الوقت لأنه يحدّد أيّ الطاولات تصلح */}
      <div className="rq-card p-4">
        <p className="field-label mb-2">
          {tr(lang, "كم شخص؟", "How many people?")}
          <span className="ms-1.5 text-xs font-medium text-[color:var(--muted)]">
            {tr(lang, `الحدّ الأعلى ${toAr(maxParty)}`, `Max ${maxParty}`)}
          </span>
        </p>
        <div className="rq-rail -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {Array.from({ length: Math.max(1, maxParty) }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setParty(n)}
              aria-pressed={cappedParty === n}
              className="h-11 w-11 shrink-0 rounded-2xl text-[15px] font-bold tabular-nums transition active:scale-95"
              style={
                cappedParty === n
                  ? { background: "var(--brand-solid)", color: "var(--brand-ink)", border: "1px solid transparent" }
                  : { background: "var(--surface)", color: "var(--brand-d)", border: "1px solid var(--border)" }
              }
            >
              {toAr(n)}
            </button>
          ))}
        </div>
      </div>

      {/* ٢) القسم — يختفي حين لا يملك الفرع إلا قسمًا واحدًا */}
      {!singleZone && (
        <div className="rq-card p-4">
          <p className="field-label mb-2">{tr(lang, "اختر مكانك", "Choose your spot")}</p>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[color:var(--surface-2)] p-1">
            {zoneOptions.map((z) => (
              <button key={z} type="button" onClick={() => setZone(z)} data-active={zone === z} className="rq-seg-btn" style={zone === z ? undefined : { background: "transparent" }}>
                {z === "inside" ? tr(lang, "داخلي", "Indoor") : tr(lang, "خارجي", "Outdoor")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ٣) اليوم */}
      <div className="rq-card p-4">
        <p className="field-label mb-2">{tr(lang, "اليوم", "Day")}</p>
        <div className="rq-rail -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((d, i) => {
            const key = riyadhISODate(d);
            const on = key === day;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDay(key)}
                aria-pressed={on}
                className="flex h-16 w-[62px] shrink-0 flex-col items-center justify-center rounded-2xl transition active:scale-95"
                style={
                  on
                    ? { background: "var(--brand-solid)", color: "var(--brand-ink)", border: "1px solid transparent" }
                    : { background: "var(--surface)", color: "var(--brand-d)", border: "1px solid var(--border)" }
                }
              >
                <span className="text-[11px] font-bold opacity-80">
                  {i === 0
                    ? tr(lang, "اليوم", "Today")
                    : i === 1
                      ? tr(lang, "غدًا", "Tmrw")
                      : d.toLocaleDateString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", weekday: "short" })}
                </span>
                <span className="mt-0.5 font-display text-lg font-bold leading-none tabular-nums">
                  {d.toLocaleDateString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric" })}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ٤) الوقت — المتاح فعلًا فقط */}
      <div className="rq-card p-4">
        <p className="field-label mb-2">{tr(lang, "الوقت المتاح", "Available times")}</p>
        {loading ? (
          <p className="py-6 text-center text-sm text-[color:var(--muted)]">{tr(lang, "نبحث عن طاولةٍ تناسبك…", "Looking for a table that fits…")}</p>
        ) : slots === null ? (
          <p className="py-6 text-center text-sm font-bold" style={{ color: "var(--danger)" }}>
            {tr(lang, "تعذّر جلب المواعيد — حدّث الصفحة.", "Couldn't load times — refresh the page.")}
          </p>
        ) : slots.length === 0 ? (
          <p className="py-6 text-center text-sm leading-6 text-[color:var(--muted)]">
            {tr(lang,
              `لا توجد طاولة لـ ${toAr(cappedParty)} في هذا اليوم — جرّب يومًا آخر أو عددًا أقل.`,
              `No table for ${cappedParty} on this day — try another day or a smaller group.`)}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {slots.map((s) => {
              const on = picked === s.at;
              return (
                <button
                  key={s.at}
                  type="button"
                  onClick={() => setPicked(s.at)}
                  aria-pressed={on}
                  className="h-11 rounded-2xl text-[13px] font-bold tabular-nums transition active:scale-95"
                  style={
                    on
                      ? { background: "var(--brand-solid)", color: "var(--brand-ink)", border: "1px solid transparent" }
                      : { background: "var(--surface)", color: "var(--brand-d)", border: "1px solid var(--border)" }
                  }
                >
                  {fmtTime(s.at, lang)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ٥) الاسم والرقم — بعد اختيار الوقت، فلا نطلب بيانات قبل أن نعرف أن ثمّة موعدًا */}
      {chosen && (
        <div className="rq-card space-y-4 p-5 reveal">
          <div className="text-right">
            <p className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "بياناتك وينتهي الحجز", "Your details and you're booked")}</p>
            <span className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "var(--st-open)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {tr(lang, "بلا حساب ولا كلمة مرور", "No account, no password")}
            </span>
          </div>
          <div>
            <label htmlFor="rsv_name" className="field-label">{tr(lang, "الاسم", "Name")}</label>
            <input id="rsv_name" name="full_name" ref={nameRef} required defaultValue={savedName} className="field-input" placeholder={tr(lang, "اكتب اسمك", "Enter your name")} />
          </div>
          <div>
            <label htmlFor="rsv_phone" className="field-label">{tr(lang, "رقم الجوّال", "Mobile number")}</label>
            <input
              id="rsv_phone" name="phone" required dir="ltr" inputMode="numeric" maxLength={10}
              value={phone}
              onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 10))}
              className="field-input text-left" placeholder="05xxxxxxxx"
            />
            {phone.length > 0 && !phoneOk && (
              <p className="mt-1.5 text-xs font-bold" style={{ color: "var(--danger)" }}>
                {tr(lang, "الرقم يبدأ بـ 05 ويتكوّن من 10 خانات.", "Number must start with 05 and be 10 digits.")}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="rsv_notes" className="field-label">{tr(lang, "ملاحظة للمطعم (اختياري)", "A note for the restaurant (optional)")}</label>
            <input id="rsv_notes" name="notes" className="field-input" placeholder={tr(lang, "مناسبة، كرسي أطفال…", "Occasion, high chair…")} />
          </div>
        </div>
      )}

      {state.error && (
        <p className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: "var(--surface)", border: "1px solid rgba(156,59,38,0.35)", color: "var(--danger)" }}>
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending || !chosen || !phoneOk} className="rq-btn disabled:opacity-50">
        {pending
          ? tr(lang, "جارٍ الحجز…", "Booking…")
          : chosen
            ? tr(lang, `احجز ${fmtTime(chosen.at, lang)}`, `Book ${fmtTime(chosen.at, lang)}`)
            : tr(lang, "اختر وقتًا أولًا", "Pick a time first")}
      </button>
    </form>
  );
}
