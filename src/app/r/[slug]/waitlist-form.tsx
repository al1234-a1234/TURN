"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { joinWaitlistGuest, type WaitlistState } from "./actions";
import { QueueTicket } from "./queue-ticket";
import { toAr, normalizePhone } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { recordTurn, lastTurnFor } from "@/lib/local-store";

type Branch = {
  id: string;
  name: string;
  city: string;
  total: number;
  inside: number;
  outside: number;
  accepts: boolean;
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
          ? { background: "linear-gradient(155deg,#b23c1d,#661c0a)", boxShadow: "0 14px 26px -16px rgba(102,28,10,0.72)" }
          : { background: "linear-gradient(160deg,#faefe8,#f4ddd0)", border: "1px solid rgba(102,28,10,0.14)" }
      }
    >
      <p className="font-display text-3xl font-bold" style={{ color: busy ? "#fff" : "var(--brand-d)" }}>
        {busy ? toAr(count) : "0"}
      </p>
      <p className="mt-1 text-xs font-bold" style={{ color: busy ? "rgba(255,255,255,0.9)" : "var(--muted)" }}>{label}</p>
      <p className="mt-0.5 text-[11px] font-bold" style={{ color: busy ? "#fff" : "var(--brand-d)" }}>
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
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-serif text-5xl font-bold text-cream-100"
                style={{ background: "linear-gradient(155deg,#a8371a,#661c0a)" }}>
            {initial}
          </span>
        )}
        {/* تدرّج بالهوية أسفل الصورة ليتضح النص */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 block h-24"
              style={{ background: "linear-gradient(to top, rgba(58,18,6,0.86), transparent)" }} />
        <span className="absolute bottom-3 start-4 end-4 block">
          <span className="block truncate font-display text-lg font-bold text-white">{b.name}</span>
          {b.city && <span className="block truncate text-[13px] font-bold text-white/85">{b.city}</span>}
        </span>
      </span>

      {/* الحالة + الدعوة */}
      <span className="block p-3.5">
        {!b.accepts ? (
          <span className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                style={{ background: "linear-gradient(160deg,#f3e8df,#e9d7c8)", border: "1px solid rgba(102,28,10,0.14)" }}>
            <span className="flex items-center gap-2 text-sm font-extrabold" style={{ color: "#9a6a4c" }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#b98a6a" }} />
              {tr(lang, "استقبال مباشر — بلا حجز دور", "Walk-in — no queue")}
            </span>
          </span>
        ) : b.total > 0 ? (
          <span className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                style={{ background: "linear-gradient(150deg,#b23c1d,#661c0a)", boxShadow: "0 12px 24px -16px rgba(102,28,10,0.72)" }}>
            <span className="flex items-center gap-2 text-sm font-extrabold text-white">
              <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
              {tr(lang, `${toAr(b.total)} بالطابور الآن`, `${toAr(b.total)} in queue now`)}
            </span>
            <span className="text-xs font-extrabold text-white/85">{tr(lang, "خذ دورك ←", "Take turn ←")}</span>
          </span>
        ) : (
          <span className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                style={{ background: "linear-gradient(160deg,#fbf1ea,#f4ddd0)", border: "1px solid rgba(102,28,10,0.16)" }}>
            <span className="flex items-center gap-2 text-sm font-extrabold" style={{ color: "var(--brand-d)" }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--brand-d)", boxShadow: "0 0 0 3px rgba(102,28,10,0.14)" }} />
              {tr(lang, "متاح الآن · بدون انتظار", "Available now · No wait")}
            </span>
            <span className="text-xs font-extrabold" style={{ color: "var(--brand-d)" }}>{tr(lang, "خذ دورك ←", "Take turn ←")}</span>
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
  // اختيار الفرع يحدَّث في الرابط أيضًا كي تتبعه القائمة والعروض والصور —
  // كان العميل يختار فرعًا ويقرأ منيو فرعٍ آخر
  function setBranchId(id: string) {
    setBranchIdRaw(id);
    // router.replace يعيد جلب محتوى الفرع (منيو/عروض/صور) من الخادم بلا قفزة
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
  const [geo, setGeo] = useState<"idle" | "asking" | "denied" | "unavailable">("idle");
  const formRef = useRef<HTMLFormElement | null>(null);
  // استرجاع دور اليوم بعد الريلود/إغلاق المتصفح — كان الضيف يفقد تذكرته نهائيًّا
  const [restored, setRestored] = useState<{ entryId: string; phone: string } | null>(null);
  useEffect(() => {
    const rec = lastTurnFor(slug);
    if (rec?.entryId && rec.phone) setRestored({ entryId: rec.entryId, phone: rec.phone });
  }, [slug]);

  function askLocation(thenSubmit: boolean) {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeo("unavailable"); return; }
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeo("idle");
        if (thenSubmit) requestAnimationFrame(() => formRef.current?.requestSubmit());
      },
      () => setGeo("denied"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }
  const branch = useMemo(() => branches.find((b) => b.id === branchId), [branchId, branches]);

  useEffect(() => {
    if (state.ok) {
      recordTurn({
        slug, name: restaurantName ?? slug, logo: restaurantLogo ?? null,
        at: new Date().toISOString(), entryId: state.entryId, phone: state.phone,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  if (state.ok) {
    return <QueueTicket position={state.position ?? 0} total={state.total ?? 0} entryId={state.entryId} phone={state.phone} restaurantName={restaurantName} />;
  }

  // تذكرة محفوظة من اليوم نفسه → نعرضها مباشرة (الاستطلاع يتحقق أنها ما زالت حيّة)
  if (restored) {
    return <QueueTicket position={0} total={0} entryId={restored.entryId} phone={restored.phone} restaurantName={restaurantName} onGone={() => setRestored(null)} />;
  }

  // خطوة اختيار الفرع (لمّا فيه أكثر من فرع ولم يُختَر بعد) — كل فرع بطاقة مستقلة
  if (multi && !branchId) {
    return (
      <BranchCarousel branches={branches} logo={logo} onSelect={setBranchId} />
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
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--sage)] px-3 py-1 text-xs font-bold text-brand-800">
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
            <p className="mt-1.5 text-xs font-bold" style={{ color: "#c0564a" }}>
              {tr(lang, "الرقم يبدأ بـ 05 ويتكوّن من 10 خانات.", "Number must start with 05 and be 10 digits.")}
            </p>
          )}
        </div>
      </div>

      {state.error && (
        <p className="rounded-2xl border border-[rgba(200,70,70,0.3)] bg-[rgba(200,70,70,0.06)] px-4 py-3 text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}

      {/* حالة الموقع — تظهر فقط عند الرفض أو التعذّر */}
      {(geo === "denied" || geo === "unavailable") && (
        <div className="rounded-2xl p-4" style={{ background: "linear-gradient(160deg,#f3e8df,#e9d7c8)", border: "1px solid rgba(102,28,10,0.16)" }}>
          <p className="text-sm font-extrabold" style={{ color: "var(--brand-d)" }}>
            {geo === "denied"
              ? tr(lang, "نحتاج موقعك لإكمال أخذ الدور", "We need your location to take a turn")
              : tr(lang, "جهازك لا يدعم تحديد الموقع", "Your device doesn't support location")}
          </p>
          <p className="mt-1 text-xs font-medium text-[color:var(--muted)]">
            {tr(lang,
              "الموقع يؤكّد للمطعم أنك قريب فعلًا. نحسب المسافة فقط ولا نحفظ موقعك.",
              "Location confirms to the restaurant that you're nearby. We store only the distance, never your location.")}
          </p>
          {geo === "denied" && (
            <button type="button" onClick={() => askLocation(false)} className="mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-extrabold text-white"
              style={{ background: "linear-gradient(150deg,#b23c1d,#661c0a)" }}>
              {tr(lang, "السماح بالموقع", "Allow location")}
            </button>
          )}
          <button type="button"
            onClick={() => { setGeo("idle"); setCoords(null); formRef.current?.requestSubmit(); }}
            className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm font-extrabold"
            style={{ background: "var(--surface-2)", color: "var(--brand-d)", border: "1px solid rgba(102,28,10,0.16)" }}>
            {tr(lang, "متابعة بدون الموقع", "Continue without location")}
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={pending || geo === "asking" || !branchId || !/^05\d{8}$/.test(phone)}
        onClick={(e) => {
          // أول ضغطة بلا موقع → يظهر طلب الإذن، ثم يُرسَل تلقائيًّا بعد السماح.
          // بعد رفضٍ أو تعذّر لا نعترض — «متابعة بدون الموقع» متاحة والخادم لا يشترطه.
          if (!coords && geo === "idle") { e.preventDefault(); askLocation(true); }
        }}
        className="rq-btn"
      >
        {geo === "asking"
          ? tr(lang, "جارٍ تحديد موقعك…", "Getting your location…")
          : pending
            ? tr(lang, "جارٍ التسجيل…", "Registering…")
            : tr(lang, "خذ دورك الآن", "Take your turn now")}
      </button>
    </form>
  );
}
