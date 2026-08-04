"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { joinWaitlistGuest, type WaitlistState } from "./actions";
import { QueueTicket } from "./queue-ticket";
import { toAr, normalizePhone } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { recordTurn, lastTurnFor, clearTurnRecovery } from "@/lib/local-store";
import Image from "next/image";

type Branch = {
  id: string;
  name: string;
  city: string;
  total: number;
  inside: number;
  outside: number;
  accepts: boolean;
  closedNow: boolean;
  busyNow: boolean;
  photo: string | null;
};

function ZoneStat({ label, count }: { label: string; count: number }) {
  const lang = useLang();
  const busy = count > 0;
  return (
    <div
      className="rounded-3xl p-4 text-center"
      style={
        busy
          ? { background: "var(--brand-solid)", boxShadow: "0 14px 26px -16px rgba(102,28,10,0.72)" }
          : { background: "var(--brand-solid)" }
      }
    >
      <p className="font-display text-3xl font-bold text-cream-100">
        {busy ? toAr(count) : "0"}
      </p>
      <p className="mt-1 text-xs font-bold text-cream-100/90">{label}</p>
      <p className="mt-0.5 text-[11px] font-bold text-cream-100">
        {busy ? tr(lang, "بالطابور", "In queue") : tr(lang, "متاح الآن", "Available now")}
      </p>
    </div>
  );
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
        {art ? (
          <Image src={art} alt="" width={828} height={414} sizes="(max-width: 640px) 100vw, 640px" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-serif text-5xl font-bold text-cream-100"
                style={{ background: "var(--brand-solid)" }}>
            {initial}
          </span>
        )}
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
          </span>
        ) : !b.accepts ? (
          <span className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                style={{ background: "var(--brand-solid)" }}>
            <span className="flex items-center gap-2 text-sm font-extrabold text-cream-100">
              <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
              {tr(lang, "استقبال مباشر — بلا حجز دور", "Walk-in — no queue")}
            </span>
          </span>
        ) : b.total > 0 ? (
          <span className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                style={{ background: "var(--brand-solid)", boxShadow: "0 12px 24px -16px rgba(102,28,10,0.72)" }}>
            <span className="flex items-center gap-2 text-sm font-extrabold text-cream-100">
              <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
              {tr(lang, `${toAr(b.total)} بالطابور الآن`, `${toAr(b.total)} in queue now`)}
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
  defaultName,
  defaultPhone,
  restaurantName,
  restaurantLogo,
  logo,
  initialBranchId,
}: {
  slug: string;
  branches: Branch[];
  defaultName: string;
  defaultPhone: string;
  restaurantName?: string;
  restaurantLogo?: string | null;
  logo?: string | null;
  /** فرع مبدئي من الرابط (?branch=) — QR الشاشة داخل الفرع لا يسأل العميل عن الفرع */
  initialBranchId?: string;
}) {
  const lang = useLang();
  const router = useRouter();
  const [state, formAction, pending] = useActionState<WaitlistState, FormData>(joinWaitlistGuest, { ok: false });

  const multi = branches.length > 1;
  // فرع واحد → مختار تلقائيًّا؛ عدّة فروع → يختار العميل من البطاقات أولًا
  // (إلا إذا جاء الفرع من الرابط — QR داخل الفرع)
  const [branchId, setBranchIdRaw] = useState<string>(initialBranchId ?? (multi ? "" : branches[0]?.id ?? ""));
  // اختيار الفرع يحدَّث في الرابط أيضًا كي تتبعه القائمة والصور —
  // كان العميل يختار فرعًا ويقرأ منيو فرعٍ آخر
  function setBranchId(id: string) {
    setBranchIdRaw(id);
    // router.replace يعيد جلب محتوى الفرع (منيو/صور) من الخادم بلا قفزة
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      if (id) u.searchParams.set("branch", id); else u.searchParams.delete("branch");
      router.replace(`${u.pathname}?${u.searchParams.toString()}`, { scroll: false });
    }
  }
  const [zone, setZone] = useState<"inside" | "outside">("inside");
  const [phone, setPhone] = useState<string>(normalizePhone(defaultPhone).slice(0, 10));
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
    const rec = lastTurnFor(slug);
    if (rec?.entryId && rec.phone) setRestored({ entryId: rec.entryId, phone: rec.phone });
  }, [slug]);

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

  const branch = useMemo(() => branches.find((b) => b.id === branchId), [branchId, branches]);

  useEffect(() => {
    if (state.ok) {
      recordTurn({
        slug, name: restaurantName ?? slug, logo: restaurantLogo ?? null,
        at: new Date().toISOString(), entryId: state.entryId, phone: state.phone,
      });
      // انضمام جديد بعد «خذ دورًا جديدًا»: startedOver كان يبقى true للأبد
      // فتُحجب تذكرة النجاح الجديدة — العميل في الطابور فعلًا والواجهة
      // تعرض النموذج الفارغ فيعيد الضغط حتى يضرب حدّ المعدّل.
      setStartedOver(false);
    }
    // الاعتماد على entryId لا ok وحده — ok يظل true بين انضمامين متتاليين
    // فلا يعاد التسجيل المحلي للدور الجديد.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.entryId]);

  if (state.ok && !startedOver) {
    return (
      <QueueTicket
        position={state.position ?? 0} total={state.total ?? 0}
        entryId={state.entryId} phone={state.phone} restaurantName={restaurantName}
        onGone={() => { clearTurnRecovery(slug); setStartedOver(true); setRestored(null); }}
      />
    );
  }

  // تذكرة محفوظة من اليوم نفسه → نعرضها (الاستطلاع يتحقّق أنها ما زالت حيّة،
  // وإن كانت حالتها نهائية يعيدنا QueueTicket للنموذج تلقائيًّا)
  if (restored) {
    return (
      <QueueTicket
        position={0} total={0} entryId={restored.entryId} phone={restored.phone}
        restaurantName={restaurantName} restored
        onGone={() => { clearTurnRecovery(slug); setRestored(null); }}
      />
    );
  }

  // خطوة اختيار الفرع (لمّا فيه أكثر من فرع ولم يُختَر بعد) — كل فرع بطاقة مستقلة
  if (multi && !branchId) {
    return (
      <BranchCarousel branches={branches} logo={logo} onSelect={setBranchId} />
    );
  }

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
          <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "جرّب لاحقًا ضمن أوقات الدوام.", "Please try again during opening hours.")}</p>
        </div>
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
          <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "تفضّل مباشرة. وعند الطاولة امسح رمز «امسح خذ هديتك» لتسجيل زيارتك ونقاطك 🎁", "Just come in. At the table, scan the gift QR to log your visit and points 🎁")}</p>
        </div>
      </div>
    );
  }

  const inside = branch?.inside ?? 0;
  const outside = branch?.outside ?? 0;

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="lat" value={coords?.lat ?? ""} />
      <input type="hidden" name="lng" value={coords?.lng ?? ""} />
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="zone" value={zone} />

      {/* رأس الفرع المختار + تغيير الفرع */}
      {multi && branch && (
        <div className="flex items-center justify-between px-1">
          <p className="font-display text-lg font-bold text-[color:var(--ink)]">
            {branch.name}{branch.city ? <span className="text-sm font-medium text-[color:var(--muted)]"> · {branch.city}</span> : null}
          </p>
          <button type="button" onClick={() => setBranchId("")} className="text-sm font-bold text-[color:var(--brand-d)]">← {tr(lang, "فرع آخر", "Another branch")}</button>
        </div>
      )}

      {branch?.busyNow && (
        <p className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-extrabold text-cream-100"
           style={{ background: "var(--brand-solid)" }}>
          <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
          {tr(lang, "الفرع مزدحم الآن — قد يطول الانتظار قليلًا", "The branch is busy now — expect a slightly longer wait")}
        </p>
      )}

      {/* طابور القسم (لهذا الفرع) */}
      <div className="grid grid-cols-2 gap-3">
        <ZoneStat label={tr(lang, "طاولات داخلية", "Indoor tables")} count={inside} />
        <ZoneStat label={tr(lang, "طاولات خارجية", "Outdoor tables")} count={outside} />
      </div>

      {/* اختيار القسم */}
      <div className="rq-card p-4">
        <p className="field-label mb-2">{tr(lang, "اختر مكانك", "Choose your spot")}</p>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[color:var(--surface-2)] p-1">
          {(["inside", "outside"] as const).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZone(z)}
              data-active={zone === z}
              className="rq-seg-btn"
              style={zone === z ? undefined : { background: "transparent" }}
            >
              {z === "inside" ? tr(lang, "طاولة داخلية", "Indoor table") : tr(lang, "طاولة خارجية", "Outdoor table")}
            </button>
          ))}
        </div>
      </div>

      {/* اسم + رقم */}
      <div className="rq-card space-y-4 p-5">
        <div className="text-right">
          <p className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "سجّل بياناتك وخذ دورك", "Enter your details and take your turn")}</p>
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-cream-100" style={{ background: "var(--brand-solid)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {tr(lang, "بلا حساب ولا كلمة مرور", "No account, no password")}
          </span>
        </div>
        <div>
          <label htmlFor="full_name" className="field-label">{tr(lang, "الاسم", "Name")}</label>
          <input id="full_name" name="full_name" required defaultValue={defaultName} className="field-input" placeholder={tr(lang, "اكتب اسمك", "Enter your name")} />
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
      {(geo === "denied" || geo === "failed" || geo === "unavailable") && (
        <div ref={geoBoxRef} className="rounded-2xl p-4 text-center" style={{ background: "var(--brand-solid)" }}>
          <p className="text-sm font-extrabold text-cream-100">
            {geo === "denied"
              ? tr(lang, "المعذرة — يرجى السماح بالموقع لأخذ دورك", "Sorry — please allow location to take your turn")
              : geo === "failed"
                ? tr(lang, "تعذّر تحديد موقعك — حاول مرة أخرى", "We couldn't get your location — try again")
                : tr(lang, "جهازك لا يدعم تحديد الموقع، فلا يمكن أخذ الدور حاليًا", "Your device doesn't support location, so a turn can't be taken right now")}
          </p>
          {geo !== "unavailable" && (
            <p className="mt-1.5 text-xs font-bold text-cream-100/90">
              {tr(lang, "اضغط «خذ دورك الآن» وسيظهر لك طلب السماح من جديد", "Tap “Take your turn now” and the permission prompt will appear again")}
            </p>
          )}
          <p className="mt-1.5 text-xs font-medium text-cream-100/75">
            {tr(lang,
              "موقعك التقريبي فقط — يؤكّد للمطعم أنك قريب، ولا نحفظه.",
              "Approximate location only — it confirms you're nearby, and we never store it.")}
          </p>
        </div>
      )}

      {/* لا مفاجآت: نخبره قبل الضغط أن الموقع التقريبي سيُطلب */}
      {geo === "idle" && !coords && (
        <p className="text-center text-[11px] font-bold text-[color:var(--muted)]">
          {tr(lang, "عند الضغط سيطلب متصفحك السماح بموقعك التقريبي", "Your browser will ask to share your approximate location")}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || geo === "asking" || !branchId || !/^05\d{8}$/.test(phone)}
        onClick={(e) => {
          // الزر لا «يموت» أبدًا: بلا موقع نطلب الإذن ثم نُرسل تلقائيًّا بعد
          // السماح؛ ومع رفضٍ محفوظ تفشل المحاولة فورًا فيبرز صندوق التعليمات
          // — كل ضغطة لها ردّ فعل مرئي.
          if (!coords && !geoWaivedRef.current) { e.preventDefault(); askLocation(true); }
        }}
        className="rq-btn"
      >
        {geo === "asking"
          ? tr(lang, "جارٍ تحديد موقعك…", "Getting your location…")
          : pending
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
  );
}
