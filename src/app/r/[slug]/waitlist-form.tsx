"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { joinWaitlistGuest, type WaitlistState } from "./actions";
import { QueueTicket } from "./queue-ticket";
import { toAr, normalizePhone } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { useSelectBranch } from "./restaurant-tabs";
import { createClient } from "@/lib/supabase/client";
import { isWithinOpeningHours } from "@/lib/dates";
import { recordTurn, lastTurnFor, clearTurnRecovery, getMe, saveMe } from "@/lib/local-store";
import { clearLiveTicketCache } from "@/components/live-ticket-bar";
import { SmartImage } from "@/components/smart-image";
import { zoneLabel, type Zone } from "@/lib/zones";
// استيرادٌ عادي لا `dynamic`: كل ما يعتمد عليه نموذج الحجز (عميل Supabase،
// التواريخ، التخزين المحلّي) موجودٌ في الحزمة أصلًا لأجل الطابور، فالتقسيم
// قِيس ولم يوفّر شيئًا — وكان يضيف وميض تحميلٍ ثمنًا لا مقابل له.
import { ReserveForm } from "./reserve-form";

type Branch = {
  id: string;
  name: string;
  city: string;
  total: number;
  /** أقسام الفرع الفعّالة بأسماء المالك، مرتّبةً كما رتّبها */
  zones: Zone[];
  /** عدد المنتظرين في كل قسم — بمفتاح القسم */
  zoneCounts: Record<string, number>;
  accepts: boolean;
  /** الحجز المسبق مُفعّل لهذا الفرع (ولديه طاولات — الحارس في الإدارة) */
  acceptsReservations: boolean;
  closedNow: boolean;
  busyNow: boolean;
  /** مفتوحٌ بلا طابور: يُعرض ويُزار ويقبل الحجز، ولا يقبل دورًا جديدًا. */
  queuePaused?: boolean;
  /** أقصى عدد أشخاص يقبله الفرع — يضبطه المالك في الإدارة */
  maxParty: number;
  /** سقف حجم الطابور — يضبطه المالك اختياريًّا؛ null يعني بلا سقف */
  maxWaitlistSize: number | null;
  photo: string | null;
};

/**
 * بطاقة عدّاد القسم — سطران لا ثلاثة.
 *
 * كانت: رقمٌ كبير، ثم اسم القسم، ثم «بالطابور». ثلاثة أسطرٍ لمعلومةٍ واحدة،
 * والسطر الثالث لا يضيف شيئًا: الرقم فوق قسمٍ مسمّى **هو** الطابور.
 *
 * وصفرٌ معروضًا كرقمٍ كبير أسوأ من زائد: عينُ العميل تلتقط الرقم قبل الكلمة،
 * فيقرأ «٠» لحظةً كأنّها عدّادٌ ما، ثم يصحّح نفسه. فالصفر يُستبدل بجملته:
 * «لا يوجد انتظار» — وهي الرسالة المقصودة أصلًا.
 */
function ZoneStat({ label, count }: { label: string; count: number }) {
  const lang = useLang();
  const busy = count > 0;
  return (
    <div
      className="flex min-h-[104px] flex-col items-center justify-center rounded-3xl p-4 text-center"
      style={
        busy
          ? { background: "var(--brand-solid)", boxShadow: "0 14px 26px -16px rgba(102,28,10,0.72)" }
          : { background: "var(--brand-solid)" }
      }
    >
      {busy ? (
        <>
          <p className="font-display text-3xl font-bold leading-none text-cream-100">{toAr(count)}</p>
          {/* نفس اللون، وأصغر قليلًا لا كثيرًا: التباين يأتي من عرض خطّ الرقم
              لا من تصغير الكلمة حتى تكاد تختفي. */}
          <p className="mt-1.5 text-lg font-bold leading-tight text-cream-100">{label}</p>
        </>
      ) : (
        <>
          <p className="text-lg font-bold leading-tight text-cream-100">
            {tr(lang, "لا يوجد انتظار", "No wait")}
          </p>
          <p className="mt-1 text-sm font-bold leading-tight text-cream-100/85">{label}</p>
        </>
      )}
    </div>
  );
}

/**
 * سطر توزيع الأقسام على بطاقة الفرع — «داخلي ٣ · خارجي ٢» بأسماء المالك.
 *
 * يُعرض ما فيه منتظرون فقط، وثلاثةٌ كحدٍّ أعلى كي لا يفيض السطر عن البطاقة.
 *
 * ── لماذا النوع أوّلًا والرقم بعده ──
 * كان «٣ داخلي». وحين يسمّي المالك قسمه «داخلي 1» — وهو واقعٌ في الإنتاج —
 * يصير السطر «١ داخلي 1»: رقمان يحيطان بالكلمة، أحدهما عدّاد والآخر جزءٌ من
 * الاسم، ولا شيء يميّزهما. فبتقديم النوع يصير «داخلي 1 · ١» ويبقى الالتباس
 * أخفّ لكنّه قائم.
 *
 * **والحلّ الكامل في البيانات لا هنا:** الاسم نفسه يجب أن يكون «داخلي».
 * وهذا الترتيب يقلّل الضرر ولا يدّعي إصلاحه — وقصّ الأرقام من أسماء الأقسام
 * برمجيًّا مرفوض: مالكٌ يسمّي قسمه «قاعة ٢» يقصدها.
 */
function zoneLine(b: Branch, lang: "ar" | "en"): string {
  const parts = (b.zones ?? [])
    .map((z) => ({ name: zoneLabel(z, lang), n: b.zoneCounts?.[z.key] ?? 0 }))
    .filter((z) => z.n > 0)
    .slice(0, 3)
    .map((z) => `${z.name} ${toAr(z.n)}`);
  return parts.join(" · ");
}

/** بطاقة فرع كصورة كبيرة داخل شريط أفقي منزلق (نمط ريكيو) — بهويتنا. */
function BranchSlide({ b, logo, onSelect }: { b: Branch; logo?: string | null; onSelect: () => void }) {
  const lang = useLang();
  const art = b.photo ?? logo ?? null;
  const initial = (b.name || "م").trim().charAt(0);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-[86%] shrink-0 snap-center overflow-hidden rounded-3xl text-right transition active:scale-[0.985] sm:w-[62%]"
      style={{ background: "var(--surface)", border: "1px solid rgba(102,28,10,0.14)", boxShadow: "0 18px 34px -22px rgba(102,28,10,0.55)" }}
    >
      {/* الصورة */}
      <span className="relative block h-52 w-full overflow-hidden">
        <SmartImage src={art} fallbackText={initial} alt="" width={828} height={414} sizes="(max-width: 640px) 100vw, 640px" className="h-full w-full object-cover" />
        {/* تدرّج بالهوية أسفل الصورة ليتضح النص */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 block h-24"
              style={{ background: "linear-gradient(to top, rgba(58,18,6,0.86), transparent)" }} />
        <span className="absolute bottom-3 start-4 end-4 block">
          <span className="block truncate font-display text-lg font-bold text-cream-100">{b.name}</span>
          {b.city && <span className="block truncate text-[13px] font-bold text-cream-100/85">{b.city}</span>}
        </span>
      </span>

      {/* الحالة + الدعوة */}
      <span className="block p-3.5">
        {b.closedNow ? (
          <span className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                style={{ background: "var(--brand-d)" }}>
            <span className="flex items-center gap-2 text-sm font-extrabold text-cream-100">
              <span className="h-2.5 w-2.5 rounded-full bg-white/80" />
              {tr(lang, "مغلق حاليًا", "Closed now")}
            </span>
            {/* بابٌ مفتوحٌ في وجهٍ مغلق: المغلق الذي يقبل الحجز ليس نهاية طريق */}
            {b.acceptsReservations && (
              <span className="text-xs font-extrabold text-cream-100/85">{tr(lang, "احجز موعدًا ←", "Book a slot ←")}</span>
            )}
          </span>
        ) : !b.accepts ? (
          <span className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                style={{ background: "var(--brand-solid)" }}>
            <span className="flex items-center gap-2 text-sm font-extrabold text-cream-100">
              <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
              {tr(lang, "استقبال مباشر — بلا حجز دور", "Walk-in — no queue")}
            </span>
            {b.acceptsReservations && (
              <span className="text-xs font-extrabold text-cream-100/85">{tr(lang, "احجز موعدًا ←", "Book a slot ←")}</span>
            )}
          </span>
        ) : b.total > 0 ? (
          <span className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                style={{ background: "var(--brand-solid)", boxShadow: "0 12px 24px -16px rgba(102,28,10,0.72)" }}>
            {/* التوزيع وحده — لا مجموعَ فوقه.
                المجموع يجمع ما لا يُجمع: من ينتظر داخليًّا لا يزاحم من ينتظر
                خارجيًّا. والعميل يسأل «أين أجلس؟»، فـ«٤ داخلي · ٢ خارجي»
                تجيبه، و«٦ بالطابور» تخيفه بلا داعٍ. وسطرٌ واحد لا سطران:
                البطاقة تضيق، والسطر الثاني كان يمطّها طولًا. */}
            <span className="flex items-center gap-2 text-sm font-extrabold text-cream-100">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white/90" />
              {zoneLine(b, lang) || tr(lang, `${toAr(b.total)} بالطابور الآن`, `${toAr(b.total)} in queue now`)}
            </span>
            <span className="text-xs font-extrabold text-cream-100/85">{tr(lang, "خذ دورك ←", "Take turn ←")}</span>
          </span>
        ) : (
          <span className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                style={{ background: "var(--brand-solid)" }}>
            <span className="flex items-center gap-2 text-sm font-extrabold text-cream-100">
              <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
              {tr(lang, "متاح الآن · بدون انتظار", "Available now · No wait")}
            </span>
            <span className="text-xs font-extrabold text-cream-100/85">{tr(lang, "خذ دورك ←", "Take turn ←")}</span>
          </span>
        )}
      </span>
    </button>
  );
}

/** شريط الفروع الأفقي: انزلاق سلس مع التقاط (snap) ومؤشّر نقاط. */
function BranchCarousel({ branches, logo, onSelect }: { branches: Branch[]; logo?: string | null; onSelect: (id: string) => void }) {
  const lang = useLang();
  const railRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  // المؤشّر يتبع التمرير (بلا مكتبات) — أقرب بطاقة لمنتصف الشريط
  function onScroll() {
    const rail = railRef.current;
    if (!rail) return;
    const mid = rail.scrollLeft + rail.clientWidth / 2;
    let best = 0, bestD = Infinity;
    Array.from(rail.children).forEach((el, i) => {
      const c = el as HTMLElement;
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    setActive(best);
  }

  function go(i: number) {
    const rail = railRef.current;
    const el = rail?.children[i] as HTMLElement | undefined;
    if (!rail || !el) return;
    rail.scrollTo({ left: el.offsetLeft - (rail.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="font-display text-base font-bold text-[color:var(--ink)]">{tr(lang, "اختر الفرع", "Choose a branch")}</p>
        <span className="text-xs font-bold text-[color:var(--muted)]">
          {tr(lang, `${toAr(branches.length)} فروع · اسحب`, `${toAr(branches.length)} branches · swipe`)}
        </span>
      </div>

      <div
        ref={railRef}
        onScroll={onScroll}
        className="rq-rail -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2"
        style={{ scrollBehavior: "smooth" }}
      >
        {branches.map((b) => (
          <BranchSlide key={b.id} b={b} logo={logo} onSelect={() => onSelect(b.id)} />
        ))}
      </div>

      {branches.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {branches.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={b.name}
              onClick={() => go(i)}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === active ? 18 : 6,
                background: i === active ? "var(--brand-d)" : "rgba(102,28,10,0.22)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WaitlistForm({
  slug,
  branches,
  defaultName = "",
  defaultPhone = "",
  restaurantName,
  restaurantLogo,
  logo,
  initialBranchId,
}: {
  slug: string;
  branches: Branch[];
  defaultName?: string;
  defaultPhone?: string;
  restaurantName?: string;
  restaurantLogo?: string | null;
  logo?: string | null;
  /** فرع مبدئي من الرابط (?branch=) — QR الشاشة داخل الفرع لا يسأل العميل عن الفرع */
  initialBranchId?: string;
}) {
  const lang = useLang();
  const selectBranch = useSelectBranch();
  const [state, formAction, pending] = useActionState<WaitlistState, FormData>(joinWaitlistGuest, { ok: false });

  const multi = branches.length > 1;
  // فرع واحد → مختار تلقائيًّا؛ عدّة فروع → يختار العميل من البطاقات أولًا
  // (إلا إذا جاء الفرع من الرابط — QR داخل الفرع)
  const [branchId, setBranchIdRaw] = useState<string>(initialBranchId ?? (multi ? "" : branches[0]?.id ?? ""));

  // `?branch=` صار يُقرأ هنا لا على الخادم: قراءته هناك كانت تمنع توليد
  // الصفحة مسبقًا، فتدفع كل مسحة باركود ثمن باركود الشاشة الداخلية.
  useEffect(() => {
    if (initialBranchId || typeof window === "undefined") return;
    const wanted = new URLSearchParams(window.location.search).get("branch");
    if (wanted && branches.some((b) => b.id === wanted)) {
      setBranchIdRaw(wanted);
      selectBranch?.(wanted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // اختيار الفرع يحدَّث في الرابط أيضًا كي تتبعه القائمة والصور —
  // كان العميل يختار فرعًا ويقرأ منيو فرعٍ آخر
  function setBranchId(id: string) {
    setBranchIdRaw(id);
    if (typeof window === "undefined") return;
    // منيو الفرع وصوره يُجلبان مباشرةً بدل إعادة توليد الصفحة كاملة
    selectBranch?.(id);
    // والرابط يُحدَّث بلا تنقّل: history لا router — كي يبقى قابلًا للمشاركة
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("branch", id); else u.searchParams.delete("branch");
    window.history.replaceState(null, "", `${u.pathname}${u.search}`);
  }
  const [zone, setZone] = useState<string>("");
  // عدد الأشخاص — كان مثبَّتًا على ١ في الخادم، فتصل كل الطوابير بشخصٍ واحد
  // وتُبنى تقارير الذروة على رقمٍ كاذب. الآن يختاره العميل ضمن سقف المالك.
  const [party, setParty] = useState(1);
  const [phone, setPhone] = useState<string>(normalizePhone(defaultPhone).slice(0, 10));
  // الاسم والجوّال من آخر مرّة على هذا الجهاز — تُقرأ بعد التركيب كي يبقى
  // ما يُرسله الخادم متطابقًا مع أول رسم (وإلا اختلف الترطيب).
  const [savedName, setSavedName] = useState("");
  const nameRef = useRef<HTMLInputElement | null>(null);

  /* الحالة الحيّة — العدّاد **ومعه** فتح الفرع وإغلاقه.
     صارت الصفحة تُولَّد مسبقًا وتُخدَم من الحافة فورًا، وثمن ذلك أن ما يُخبَز
     فيها قد يتأخّر حتى ٦٠ث. والعدّاد أهون ما في الأمر: لو أغلق المضيف الفرع
     من الاستقبال، كانت البطاقة تبقى تقول «متاح الآن · خذ دورك» دقيقةً كاملة،
     فيملأ العميل النموذج ثم يُردّ بخطأ «الفرع مغلق حاليًا». نُحدّث الاثنين
     معًا فور الرسم فتعود البطاقة صادقة. */
  type Live = { total: number; zoneCounts?: Record<string, number>; accepts?: boolean; acceptsReservations?: boolean; closedNow?: boolean; busyNow?: boolean; queuePaused?: boolean; maxWaitlistSize?: number | null };
  const [live, setLive] = useState<Record<string, Live>>({});
  useEffect(() => {
    const ids = branches.map((b) => b.id);
    if (!ids.length) return;
    let alive = true;
    const sb = createClient();
    Promise.all([
      sb.rpc("waitlist_counts_for", { p_branch_ids: ids }),
      // ولكل قسمٍ عدّاده: العدّاد القديم يعرف عمودَي inside/outside فقط
      sb.rpc("waitlist_counts_by_zone", { p_branch_ids: ids }),
      sb.from("branch_settings")
        .select("branch_id, accepts_waitlist, accepts_reservations, manually_closed, busy_now, queue_paused, opening_hours, max_waitlist_size")
        .in("branch_id", ids),
    ])
      .then(([counts, byZone, settings]) => {
        if (!alive) return;
        const next: Record<string, Live> = {};
        for (const c of counts.data ?? []) {
          next[c.branch_id] = { total: c.total, zoneCounts: {} };
        }
        for (const z of byZone.data ?? []) {
          const cur = next[z.branch_id] ?? { total: 0, zoneCounts: {} };
          cur.zoneCounts = { ...(cur.zoneCounts ?? {}), [z.zone_key]: Number(z.waiting) };
          next[z.branch_id] = cur;
        }
        for (const st of settings.data ?? []) {
          const cur = next[st.branch_id] ?? { total: 0, zoneCounts: {} };
          next[st.branch_id] = {
            ...cur,
            accepts: st.accepts_waitlist ?? true,
            acceptsReservations: st.accepts_reservations ?? false,
            busyNow: st.busy_now ?? false,
            queuePaused: st.queue_paused ?? false,
            closedNow: (st.manually_closed ?? false) || !isWithinOpeningHours(st.opening_hours as { open?: string | null; close?: string | null } | null),
            maxWaitlistSize: st.max_waitlist_size ?? null,
          };
        }
        setLive(next);
      })
      // فشلٌ عابر يُبقي المخبوز — وهو صحيحٌ حتى دقيقة مضت، لا خطأ
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const branchesLive = useMemo(
    () => branches.map((b) => (live[b.id] ? { ...b, ...live[b.id] } : b)),
    [branches, live],
  );
  useEffect(() => {
    const me = getMe();
    if (me.name) setSavedName(me.name);
    if (me.phone) setPhone((cur) => (cur ? cur : normalizePhone(me.phone!).slice(0, 10)));
  }, []);
  // بوابة الموقع: لا يُؤخذ الدور إلا بمشاركة الموقع (يمنع الحجز الوهمي من بعيد)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // failed = تعذّر مؤقت (GPS/مهلة) يختلف عن الرفض الصريح — لكلٍّ رسالته وعلاجه
  const [geo, setGeo] = useState<"idle" | "asking" | "denied" | "failed" | "unavailable">("idle");
  const formRef = useRef<HTMLFormElement | null>(null);
  const geoBoxRef = useRef<HTMLDivElement | null>(null);
  // حظر دائم من المتصفح: نافذة النظام لن تعود مهما ضغط — نعرض دليل تفعيل
  // أنيقًا (نافذة سفلية بالهوية) بدل رسالة يتيمة، ونراقب الإذن: أول ما
  // يفعّله ويرجع للصفحة نكمل دوره تلقائيًّا بلا أي ضغطة.
  const [geoSheet, setGeoSheet] = useState(false);
  // سمح بالإذن لكن جهازه عاجز عن التحديد (شبكة/GPS) — ندخله بلا مسافة
  const geoWaivedRef = useRef(false);
  const isIOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  // استرجاع دور اليوم بعد الريلود/إغلاق المتصفح — كان الضيف يفقد تذكرته نهائيًّا
  const [restored, setRestored] = useState<{ entryId: string; phone: string } | null>(null);
  // بعد «خذ دورًا جديدًا» نتجاوز تذكرة الجلسة السابقة ونعود للنموذج
  const [startedOver, setStartedOver] = useState(false);
  useEffect(() => {
    // ١) المسار السريع: سجلّ اليوم في هذا الجهاز
    const rec = lastTurnFor(slug);
    if (rec?.entryId && rec.phone) {
      setRestored({ entryId: rec.entryId, phone: rec.phone });
      return;
    }
    // ٢) وإلا: نسأل الخادم برقمه.
    //
    // السجلّ المحلّي يضيع بأشياء كثيرة — إغلاق المتصفّح، تصفّحٌ خفيّ، تثبيت
    // التطبيق (سياق تخزينٍ جديد)، أو مجرّد عبور منتصف الليل (سجلّ اليوم).
    // وكان العميل حينها يفتح الصفحة فيجد نموذجًا فارغًا وكأنه لم يأخذ دورًا،
    // ودورُه قائمٌ في المطعم. الرقم هويّته، فنسأل به.
    const me = getMe();
    const phone = me.phone ? normalizePhone(me.phone).slice(0, 10) : "";
    if (!/^05\d{8}$/.test(phone)) return;
    let alive = true;
    fetch(`/api/my-status?phone=${phone}`)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((j) => {
        if (!alive) return;
        // 0131: الصفّ يحمل venue_slug ومعرّف الدور — قبلها كان هذا المسار
        // يبحث عن حقلَين سحبتهما 0104 فلا يجد شيئًا أبدًا، وصاحب الدور
        // يفتح صفحة المطعم من جهازٍ آخر فيرى نموذجًا فارغًا لا تذكرته.
        const mine = (j.rows ?? []).find(
          (r: { kind: string; venue_slug: string | null; id: string | null }) =>
            r.kind === "turn" && r.venue_slug === slug && r.id,
        );
        if (mine) setRestored({ entryId: mine.id, phone });
      });
    return () => { alive = false; };
  }, [slug]);

  // جلبٌ صامت مسبق: من سمح بالموقع من قبل كان ينتظره عند «أحجز» ثوانيَ
  // كاملة («جارٍ التسجيل…» خمس ثوانٍ — شكوى المشغّل نصًّا). الإذن الممنوح
  // يعني ألّا نافذة نظامٍ ستظهر، فنستبق ونحضّر الإحداثيات مع فتح الصفحة.
  // لا نلمس حالة `geo` إطلاقًا: فشل الاستباق لا يُظهر رسالةً لعميلٍ لم
  // يطلب شيئًا بعد — ومسار الإرسال يتصرّف حينها كما كان.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    navigator.permissions?.query?.({ name: "geolocation" })
      .then((s) => {
        if (cancelled || s.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            setCoords((cur) => cur ?? { lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => { /* صامت — يعالجه مسار الإرسال إن لزم */ },
          { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 },
        );
      })
      .catch(() => { /* متصفّح بلا Permissions API — نبقى على مسار الإرسال */ });
    return () => { cancelled = true; };
  }, []);

  function askLocation(thenSubmit: boolean, attempt = 1) {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeo("unavailable"); return; }
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // flushSync: الإرسال كان يسبق كتابة الإحداثيات في الحقول أحيانًا
        // فيرفضه الخادم وكأن الموقع لم يُشارك — الآن الرسم يكتمل قبل الإرسال.
        flushSync(() => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setGeo("idle");
        });
        if (thenSubmit) formRef.current?.requestSubmit();
      },
      (err) => {
        if (err.code !== 1 && attempt === 1) {
          // تعذّر بلا رفض (شبكة لا تحدد الموقع): محاولة ثانية تلقائية بالـGPS
          // الدقيق — كثير من الأجهزة ينجح فيها حيث تفشل الشبكة.
          askLocation(thenSubmit, 2);
          return;
        }
        if (err.code !== 1) {
          // فشلت المحاولتان والعميل سامح بالإذن أصلًا — جهازُه عاجز عن التحديد
          // لا هو رافض. لا نحبس عميلًا واقفًا على باب المطعم: ندخله بلا مسافة.
          navigator.permissions?.query?.({ name: "geolocation" })
            .then((s) => {
              if (s.state === "granted") {
                geoWaivedRef.current = true;
                flushSync(() => setGeo("idle"));
                if (thenSubmit) formRef.current?.requestSubmit();
              } else {
                setGeo("failed");
              }
            })
            .catch(() => setGeo("failed"));
          return;
        }
        // رفض صريح — الرسالة القصيرة، وكل ضغطة تعيد نافذة النظام
        setGeo("denied");
        // إن كان الحظر محفوظًا في المتصفح (النافذة لن تعود) → دليل التفعيل
        navigator.permissions?.query?.({ name: "geolocation" })
          .then((s) => { if (s.state === "denied") setGeoSheet(true); })
          .catch(() => {});
        requestAnimationFrame(() => geoBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
      },
      // المحاولة ١: موقع تقريبي سريع (يكفينا كم كيلو/متر).
      // المحاولة ٢: دقّة عالية بلا كاش — طوق نجاة للأجهزة التي فشلت شبكيًّا.
      attempt === 1
        ? { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 }
        : { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }
  // عين على الإذن ما دام الدليل مفتوحًا: تغيّر إلى «مسموح» (من الإعدادات أو
  // من نافذة النظام) أو رجوع للصفحة بعد التفعيل → نأخذ الدور تلقائيًّا.
  useEffect(() => {
    if (!geoSheet || typeof navigator === "undefined") return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const finish = () => { setGeoSheet(false); askLocation(true); };
    navigator.permissions?.query?.({ name: "geolocation" })
      .then((s) => {
        if (cancelled) return;
        status = s;
        s.onchange = () => { if (s.state === "granted") finish(); };
      })
      .catch(() => {});
    const onVisible = () => {
      if (document.hidden) return;
      navigator.permissions?.query?.({ name: "geolocation" })
        .then((s) => { if (!cancelled && s.state === "granted") finish(); })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (status) status.onchange = null;
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoSheet]);

  const branch = useMemo(() => branchesLive.find((b) => b.id === branchId), [branchId, branchesLive]);

  useEffect(() => {
    if (state.ok) {
      recordTurn({
        slug, name: restaurantName ?? slug, logo: restaurantLogo ?? null,
        at: new Date().toISOString(), entryId: state.entryId, phone: state.phone,
      });
      // يُعبَّأ تلقائيًّا في المرّة القادمة — لأي مطعم، وللضيف كما للمسجَّل
      saveMe({ name: nameRef.current?.value?.trim() || undefined, phone: state.phone });
      // دورٌ بدأ الآن يجب أن يظهر في الشريط المتنقّل فورًا لا بعد دقيقة
      clearLiveTicketCache();
      // انضمام جديد بعد «خذ دورًا جديدًا»: startedOver كان يبقى true للأبد
      // فتُحجب تذكرة النجاح الجديدة — العميل في الطابور فعلًا والواجهة
      // تعرض النموذج الفارغ فيعيد الضغط حتى يضرب حدّ المعدّل.
      setStartedOver(false);
    }
    // الاعتماد على entryId لا ok وحده — ok يظل true بين انضمامين متتاليين
    // فلا يعاد التسجيل المحلي للدور الجديد.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.entryId]);

  // الفرع مغلقٌ الآن؟ — للفرع المختار، وإلّا فحين تُغلق كل الفروع (تذكرةٌ
  // مسترجَعة قد تصل بلا فرعٍ مختار). التذكرة تحتاجها كي لا تَعِد بتنبيهٍ
  // لن يأتي: القاعدة تُنهي الطابور بعد الإغلاق، لكنها تمرّ كل ربع ساعة.
  const ticketBranchClosed = branch
    ? branch.closedNow
    : branchesLive.length > 0 && branchesLive.every((b) => b.closedNow);

  if (state.ok && !startedOver) {
    return (
      <QueueTicket
        position={state.position ?? 0} total={state.total ?? 0}
        entryId={state.entryId} phone={state.phone} restaurantName={restaurantName}
        branchClosed={ticketBranchClosed}
        onGone={() => { clearTurnRecovery(slug); setStartedOver(true); setRestored(null); }}
        onCancelled={() => clearTurnRecovery(slug)}
      />
    );
  }

  // تذكرة محفوظة من اليوم نفسه → نعرضها (الاستطلاع يتحقّق أنها ما زالت حيّة،
  // وإن كانت حالتها نهائية يعيدنا QueueTicket للنموذج تلقائيًّا)
  if (restored) {
    return (
      <QueueTicket
        position={0} total={0} entryId={restored.entryId} phone={restored.phone}
        restaurantName={restaurantName} restored branchClosed={ticketBranchClosed}
        onGone={() => { clearTurnRecovery(slug); setRestored(null); }}
        onCancelled={() => clearTurnRecovery(slug)}
      />
    );
  }

  // خطوة اختيار الفرع (لمّا فيه أكثر من فرع ولم يُختَر بعد) — كل فرع بطاقة مستقلة
  if (multi && !branchId) {
    return (
      <BranchCarousel branches={branchesLive} logo={logo} onSelect={setBranchId} />
    );
  }

  const branchHead = multi && branch ? (
    <div className="flex items-center justify-between px-1">
      <p className="font-display text-lg font-bold text-[color:var(--ink)]">
        {branch.name}{branch.city ? <span className="text-sm font-medium text-[color:var(--muted)]"> · {branch.city}</span> : null}
      </p>
      <button type="button" onClick={() => setBranchId("")} className="text-sm font-bold text-[color:var(--brand-d)]">← {tr(lang, "فرع آخر", "Another branch")}</button>
    </div>
  ) : null;

  /* الحجز قسمٌ مستقلّ أسفل الطابور، لا خيارٌ يُقابله.
     كان شريطًا يسأل «أنا هنا الآن أم أحجز لاحقًا؟» فوق كل شيء — فيوقف من جاء
     ليأخذ دوره أمام سؤالٍ لم يأتِ لأجله. والغالبية العظمى واقفةٌ على الباب.
     الآن: الطابور أوّلًا كما كان، ومن أراد موعدًا وجده تحته. شيئان منفصلان
     لا مفترق طرق. */
  const reserveSection = branch?.acceptsReservations ? (
    <section className="mt-9">
      <div className="mb-3 px-1">
        <h2 className="font-display text-base font-bold text-[color:var(--ink)]">
          {tr(lang, "أو احجز لوقتٍ لاحق", "Or book for later")}
        </h2>
        <p className="mt-0.5 text-[13px] font-medium text-[color:var(--muted)]">
          {tr(lang, "طاولةٌ باسمك في موعدٍ تختاره.", "A table in your name, at a time you pick.")}
        </p>
      </div>
      <ReserveForm
        slug={slug}
        branchId={branch.id}
        maxParty={Math.max(1, branch.maxParty ?? 1)}
        zones={branch.zones ?? []}
      />
    </section>
  ) : null;

  // مغلق فعليًّا الآن (يدويًا من الاستقبال أو خارج أوقات الدوام) — يسبق حالة
  // «استقبال مباشر» لأنه يعني لا أحد يُستقبَل إطلاقًا، لا حتى بلا حجز دور.
  if (branch && branch.closedNow) {
    return (
      <div className="space-y-3">
        {multi && (
          <button type="button" onClick={() => setBranchId("")} className="text-sm font-bold text-[color:var(--brand-d)]">← {tr(lang, "فرع آخر", "Another branch")}</button>
        )}
        <div className="rq-card p-7 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-cream-100" style={{ background: "var(--brand-d)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </span>
          <p className="text-lg font-bold text-[color:var(--ink)]">{tr(lang, "هذا الفرع مغلق حاليًا", "This branch is closed right now")}</p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {branch.acceptsReservations
              ? tr(lang, "لكن يمكنك حجز موعدٍ قادم من الأسفل.", "But you can book an upcoming slot below.")
              : tr(lang, "جرّب لاحقًا ضمن أوقات الدوام.", "Please try again during opening hours.")}
          </p>
        </div>
        {reserveSection}
      </div>
    );
  }

  // مغلق / لا يستقبل الآن (لهذا الفرع)
  if (branch && !branch.accepts) {
    return (
      <div className="space-y-3">
        {multi && (
          <button type="button" onClick={() => setBranchId("")} className="text-sm font-bold text-[color:var(--brand-d)]">← {tr(lang, "فرع آخر", "Another branch")}</button>
        )}
        <div className="rq-card p-7 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(192,86,74,0.12)", color: "var(--st-closed)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </span>
          <p className="text-lg font-bold text-[color:var(--ink)]">{tr(lang, "هذا الفرع يستقبل مباشرة — بلا حجز دور", "This branch welcomes walk-ins — no queue needed")}</p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "تفضّل مباشرة — طاولتك جاهزة.", "Just come in — your table is ready.")}</p>
        </div>
        {reserveSection}
      </div>
    );
  }

  // «مفتوح بلا طابور» — المطعم فاضٍ فلا معنى لدورٍ رقمه ١.
  //
  // يسبق فحص الامتلاء عمدًا: الفرع الموقوف طابورُه ليس ممتلئًا، ورسالة
  // «ممتلئ» هنا تقول عكس الحقيقة تمامًا.
  //
  // ونمنع الإرسال في الواجهة **مع** الحارس في القاعدة (P0011) لا بدلًا منه:
  // الإخفاء وحده يتخطّاه نداءٌ مباشر، والقاعدة وحدها تعني نموذجًا يقبل
  // الضغطة ثم يردّها بخطأ بعد أن كتب العميل اسمه ورقمه.
  if (branch && branch.queuePaused) {
    return (
      <div className="space-y-3">
        {multi && (
          <button type="button" onClick={() => setBranchId("")} className="text-sm font-bold text-[color:var(--brand-d)]">← {tr(lang, "فرع آخر", "Another branch")}</button>
        )}
        <div className="rq-card p-7 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-cream-100" style={{ background: "var(--brand-solid)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <p className="text-lg font-bold text-[color:var(--ink)]">
            {tr(lang, "لا يوجد انتظار", "No wait")}
          </p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {tr(lang, "المطعم مفتوح ويستقبل الآن — تفضّل مباشرةً بلا حجز دور.",
                      "The restaurant is open and seating now — just walk in, no queue needed.")}
          </p>
        </div>
        {reserveSection}
      </div>
    );
  }

  // امتلأ الطابور — سقفٌ ضبطه المالك (اختياري بالكامل، افتراضيًّا بلا حد).
  // نمنع الإرسال هنا أيضًا لا في الخادم وحده: عميلٌ يرى «ممتلئ» ويُمنع من
  // الكتابة أوضح من نموذجٍ يقبل ضغطته ثم يردّه بخطأ بعد التسجيل.
  const queueFull = branch != null && branch.maxWaitlistSize != null && branch.total >= branch.maxWaitlistSize;
  if (branch && queueFull) {
    return (
      <div className="space-y-3">
        {multi && (
          <button type="button" onClick={() => setBranchId("")} className="text-sm font-bold text-[color:var(--brand-d)]">← {tr(lang, "فرع آخر", "Another branch")}</button>
        )}
        <div className="rq-card p-7 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(192,86,74,0.12)", color: "var(--st-closed)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M17 20.5v-1.5a4 4 0 00-4-4H8a4 4 0 00-4 4v1.5M10 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19 8v4M21 10h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <p className="text-lg font-bold text-[color:var(--ink)]">
            {tr(lang, `الطابور ممتلئ حاليًا (${toAr(branch.maxWaitlistSize ?? 0)})`, `The queue is full right now (${branch.maxWaitlistSize})`)}
          </p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {tr(lang, "حاول بعد قليل — تُفتح المقاعد أول بأول مع جلوس أو مغادرة أشخاص.", "Try again shortly — spots open up as people are seated or leave.")}
          </p>
        </div>
        {reserveSection}
      </div>
    );
  }

  // عدّاد القسم: الحيّ إن وصل، وإلا المخبوز في الصفحة (صحيحٌ حتى دقيقة مضت)
  const zoneCountOf = (key: string) => branch?.zoneCounts?.[key] ?? 0;

  // أقسام هذا الفرع. الافتراضي الاثنان — فرعٌ بلا صفّ إعدادات يبقى كما كان.
  const zoneOptions = branch?.zones ?? [];
  // قسمٌ واحد = لا سؤال ولا اختيار: خطوةٌ أقلّ على باب مطعمٍ مزدحم
  const singleZone = zoneOptions.length === 1;
  // لم يختر بعد ⇒ أوّل قسمٍ رتّبه المالك. الفراغ كان يترك القرار للحارس في
  // القاعدة، فيقف العميل في قسمٍ لم يره على الشاشة.
  const effectiveZone = zone || zoneOptions[0]?.key || "";
  // السقف يتبع الفرع المختار — وتبديل الفرع قد يخفضه تحت ما اختاره العميل
  const maxParty = Math.max(1, branch?.maxParty ?? 1);
  const effectiveParty = Math.min(party, maxParty);

  return (
    <>
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="lat" value={coords?.lat ?? ""} />
      <input type="hidden" name="lng" value={coords?.lng ?? ""} />
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="zone" value={effectiveZone} />
      <input type="hidden" name="party_size" value={effectiveParty} />

      {/* رأس الفرع المختار + تغيير الفرع */}
      {branchHead}

      {/* الازدحام: قالبٌ عنابيّ كبقيّة القوالب لا شريطٌ عريضٌ فوقها.
          والنصّ مختصر — «قد يطول الانتظار قليلًا» تحصيلُ حاصلٍ بعد كلمة
          «مزدحم»، وكانت تمطّ الشريط سطرين على شاشة الجوّال. */}
      {branch?.busyNow && (
        <p className="flex items-center justify-center gap-2 rounded-3xl p-4 text-center text-lg font-bold text-cream-100"
           style={{ background: "var(--brand-solid)" }}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white/90" />
          {tr(lang, "المطعم مزدحم الآن", "The restaurant is busy now")}
        </p>
      )}

      {/* طابور القسم (لهذا الفرع) — لا يُعرض عدّاد قسمٍ لا يملكه الفرع */}
      {/* عدّاد لكل قسمٍ بالاسم الذي كتبه المالك. ثلاثة أقسامٍ فأكثر تنزلق
          أفقيًّا بدل أن تنضغط في شبكةٍ لا تتّسع لأسمائها. */}
      <div className={zoneOptions.length >= 3 ? "rq-rail -mx-1 flex gap-3 overflow-x-auto px-1 pb-1" : `grid gap-3 grid-cols-${Math.max(1, zoneOptions.length)}`}>
        {zoneOptions.map((z) => (
          <div key={z.key} className={zoneOptions.length >= 3 ? "w-[46%] shrink-0" : ""}>
            <ZoneStat label={zoneLabel(z, lang)} count={zoneCountOf(z.key)} />
          </div>
        ))}
      </div>

      {/* اختيار القسم — يختفي كليًّا حين لا يملك الفرع إلا قسمًا واحدًا */}
      {!singleZone && (
        <div className="rq-card p-4">
          <p className="field-label mb-2">{tr(lang, "اختر مكانك", "Choose your spot")}</p>
          <div className={`grid gap-2 rounded-2xl bg-[color:var(--surface-2)] p-1 ${zoneOptions.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {zoneOptions.map((z) => (
              <button
                key={z.key}
                type="button"
                onClick={() => setZone(z.key)}
                data-active={zone === z.key}
                className="rq-seg-btn"
                style={zone === z.key ? undefined : { background: "transparent" }}
              >
                {zoneLabel(z, lang)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* عدد الأشخاص — محدودٌ بسقف الفرع، فلا يختار العميل رقمًا يُرفض بعده */}
      {maxParty > 1 && (
        <div className="rq-card p-4">
          {/* «الحدّ الأعلى ٦» حُذف: الأزرار المعروضة هي الحدّ نفسه — لا يستطيع
              العميل اختيار أكثر، فذكره حشوٌ يشغل السطر. */}
          <p className="field-label mb-2">{tr(lang, "عدد الأشخاص", "Number of people")}</p>
          {/* جملةٌ واحدة: التكرار كان يُضاعف عدد المنتظرين ظاهريًّا حين يسجّل
              كلُّ فردٍ من المجموعة نفسه على حدة. */}
          <p className="mb-2.5 text-xs font-semibold" style={{ color: "var(--muted)" }}>
            {tr(lang, "يحجز شخص واحد عن المجموعة", "One person books for the whole group")}
          </p>
          <div className="rq-rail -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {Array.from({ length: maxParty }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setParty(n)}
                aria-pressed={effectiveParty === n}
                className="h-11 w-11 shrink-0 rounded-2xl text-[15px] font-bold tabular-nums transition active:scale-95"
                style={
                  effectiveParty === n
                    ? { background: "var(--brand-solid)", color: "var(--brand-ink)", border: "1px solid transparent" }
                    : { background: "var(--surface)", color: "var(--brand-d)", border: "1px solid var(--border)" }
                }
              >
                {toAr(n)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* اسم + رقم */}
      <div className="rq-card space-y-4 p-5">
        <div className="text-right">
          <p className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "سجّل بياناتك وخذ دورك", "Enter your details and take your turn")}</p>
        </div>
        <div>
          <label htmlFor="full_name" className="field-label">{tr(lang, "الاسم", "Name")}</label>
          <input id="full_name" name="full_name" ref={nameRef} required defaultValue={defaultName || savedName} className="field-input" placeholder={tr(lang, "اكتب اسمك", "Enter your name")} />
        </div>
        <div>
          <label htmlFor="phone" className="field-label">{tr(lang, "رقم الجوّال", "Mobile number")}</label>
          {/* الأرقام تُطبَّع أثناء الكتابة: عربي/فارسي → لاتيني، وتُقصّ على ١٠ خانات.
              بدون هذا كانت لوحة المفاتيح العربية تحفظ أرقامًا مشوّهة فيتشظّى العميل. */}
          <input
            id="phone" name="phone" required dir="ltr" inputMode="numeric" maxLength={10}
            value={phone}
            onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 10))}
            className="field-input text-left" placeholder="05xxxxxxxx"
          />
          {phone.length > 0 && !/^05\d{8}$/.test(phone) && (
            <p className="mt-1.5 text-xs font-bold" style={{ color: "var(--danger)" }}>
              {tr(lang, "الرقم يبدأ بـ 05 ويتكوّن من 10 خانات.", "Number must start with 05 and be 10 digits.")}
            </p>
          )}
        </div>
      </div>

      {state.error && (
        <p className="rounded-2xl border border-[rgba(200,70,70,0.3)] bg-[rgba(200,70,70,0.06)] px-4 py-3 text-sm font-medium text-[color:var(--danger)]">
          {state.error}
        </p>
      )}

      {/* رسالة الرفض/التعذّر — اعتذار قصير، والحل: نفس زر «خذ دورك الآن»
          يعيد إظهار نافذة السماح الأصلية (كروم/سفاري) مع كل ضغطة */}
      {/* كان هذا الخطأ يُرسم على نفس عنابيّ الأزرار المُشبَع، فيُقرأ زرًّا
          لا تحذيرًا — يضغطه العميل فلا يحدث شيء. الهوية تملك لون خطرٍ
          مستقلًّا (`--danger`) ولم يكن مستعمَلًا هنا. */}
      {(geo === "denied" || geo === "failed" || geo === "unavailable") && (
        <div
          ref={geoBoxRef}
          className="rounded-2xl p-4 text-center"
          style={{ background: "var(--surface)", border: "1px solid rgba(156,59,38,0.35)" }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--danger)" }}>
            {geo === "denied"
              ? tr(lang, "المعذرة — يرجى السماح بالموقع لأخذ دورك", "Sorry — please allow location to take your turn")
              : geo === "failed"
                ? tr(lang, "تعذّر تحديد موقعك — حاول مرة أخرى", "We couldn't get your location — try again")
                : tr(lang, "جهازك لا يدعم تحديد الموقع، فلا يمكن أخذ الدور حاليًا", "Your device doesn't support location, so a turn can't be taken right now")}
          </p>
          {geo !== "unavailable" && (
            <p className="mt-1.5 text-xs font-semibold text-[color:var(--ink)]">
              {tr(lang, "اضغط «خذ دورك الآن» وسيظهر لك طلب السماح من جديد", "Tap “Take your turn now” and the permission prompt will appear again")}
            </p>
          )}
          <p className="mt-1.5 text-xs font-medium text-[color:var(--muted)]">
            {tr(lang,
              "موقعك التقريبي فقط — يؤكّد للمطعم أنك قريب، ولا نحفظه.",
              "Approximate location only — it confirms you're nearby, and we never store it.")}
          </p>
        </div>
      )}

      <button
        type="submit"
        // ٢٧-٠٨: الموقع عاد اختياريًّا بحتًا بطلب المشغّل المباشر — عملاء
        // حقيقيون وقفوا عاجزين عن أخذ دورهم لأن جهازهم لا يدعم تحديد الموقع
        // أو رفضوا الإذن، والزرّ كان يرفض المتابعة بلا موقع. الآن يرسل
        // فورًا دائمًا؛ الإحداثيات إن وُجدت (استباقٌ صامتٌ خلفيّ فقط، بلا أي
        // طلب إذنٍ من هذا الزر) تُرفَق، وغيابها لا يمنع أحدًا من الانضمام.
        disabled={pending || !branchId || !/^05\d{8}$/.test(phone)}
        className="rq-btn"
      >
        {pending
          ? tr(lang, "جارٍ التسجيل…", "Registering…")
          : tr(lang, "خذ دورك الآن", "Take your turn now")}
      </button>

      {/* دليل تفعيل الموقع — نافذة سفلية بالهوية تظهر فقط عند الحظر الدائم */}
      {geoSheet && (
        <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal>
          <button type="button" aria-label={tr(lang, "إغلاق", "Close")} className="absolute inset-0 cursor-default bg-black/45" onClick={() => setGeoSheet(false)} />
          <div className="relative w-full rounded-t-[30px] bg-[color:var(--surface)] px-6 pb-8 pt-3 shadow-2xl">
            <span className="mx-auto mb-5 block h-1 w-11 rounded-full bg-[rgba(102,28,10,0.18)]" />
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-cream-100" style={{ background: "var(--brand-solid)" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.9" />
              </svg>
            </span>
            <p className="mt-3 text-center font-display text-lg font-extrabold text-[color:var(--ink)]">
              {tr(lang, "باقي خطوة وحدة على دورك", "One step left to your turn")}
            </p>
            <p className="mt-1 text-center text-[13px] font-medium text-[color:var(--muted)]">
              {tr(lang, "متصفحك حاظر مشاركة الموقع — فعّله وارجع لنا، وبنكمل دورك تلقائيًا.", "Your browser has location blocked — enable it and come back; we'll finish your turn automatically.")}
            </p>

            <ol className="mx-auto mt-5 max-w-xs space-y-3">
              {(isIOS
                ? [
                    tr(lang, "افتح «الإعدادات» في جوالك", "Open your phone's Settings"),
                    tr(lang, "الخصوصية والأمان ← خدمات الموقع ← سفاري", "Privacy & Security → Location Services → Safari"),
                    tr(lang, "اختر «أثناء استخدام التطبيق» وارجع لنا", "Choose “While Using” and come back"),
                  ]
                : [
                    tr(lang, "اضغط رمز القفل بجانب رابط الصفحة", "Tap the lock icon next to the address"),
                    tr(lang, "الأذونات ← الموقع", "Permissions → Location"),
                    tr(lang, "اختر «السماح» وارجع لنا", "Choose “Allow” and come back"),
                  ]
              ).map((step, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-cream-100" style={{ background: "var(--brand-solid)" }}>
                    {toAr(i + 1)}
                  </span>
                  <span className="text-[13.5px] font-bold text-[color:var(--ink)]">{step}</span>
                </li>
              ))}
            </ol>

            {/* سماح الموقع (الإلكتروني) وحده لا يكفي إن كان التطبيق نفسه أو
                الجهاز حاظرًا — أكثر حالة «فعّلتُه وما نفع» في الواقع. */}
            <div className="mx-auto mt-4 max-w-xs rounded-2xl bg-[rgba(102,28,10,0.06)] px-4 py-3">
              <p className="text-[12.5px] font-extrabold text-[color:var(--ink)]">
                {tr(lang, "سويتها وما نفع؟ تأكد من مفتاحين بالجهاز:", "Did it and still stuck? Check two device switches:")}
              </p>
              <ul className="mt-1.5 space-y-1 text-[12px] font-bold leading-5 text-[color:var(--muted)]">
                {(isIOS
                  ? [
                      tr(lang, "الإعدادات ← الخصوصية ← خدمات الموقع: المفتاح الرئيسي مفعّل", "Settings → Privacy → Location Services: master switch on"),
                      tr(lang, "وتحتها سفاري (أو متصفحك): «أثناء الاستخدام»", "and under it Safari (or your browser): “While Using”"),
                    ]
                  : [
                      tr(lang, "الإعدادات ← التطبيقات ← المتصفح ← الأذونات ← الموقع: «السماح»", "Settings → Apps → your browser → Permissions → Location: “Allow”"),
                      tr(lang, "خدمة الموقع مفعّلة بالجهاز (أيقونة الموقع بالإعدادات السريعة)", "Device location is on (location icon in quick settings)"),
                    ]
                ).map((hint, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>{hint}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => askLocation(true)}
              className="mt-6 w-full rounded-2xl px-4 py-3.5 text-sm font-extrabold text-cream-100 transition active:scale-[0.985]"
              style={{ background: "var(--brand-solid)", boxShadow: "0 14px 26px -14px rgba(58,18,6,0.7)" }}
            >
              {geo === "asking" ? tr(lang, "جارٍ التحقق…", "Checking…") : tr(lang, "فعّلته — خذ دوري ✓", "Enabled — take my turn ✓")}
            </button>
            <p className="mt-2.5 text-center text-[11px] font-medium text-[color:var(--muted)]">
              {tr(lang, "موقعك التقريبي فقط، ولا نحفظه", "Approximate location only — never stored")}
            </p>
          </div>
        </div>
      )}
    </form>
    {/* خارج النموذج لا داخله: نموذجٌ داخل نموذج غير صالح في HTML، وكان
        زرّ الحجز سيُرسل نموذج الطابور بدلًا منه. */}
    {reserveSection}
    </>
  );
}
