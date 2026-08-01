"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { cancelWaitlistGuest, savePushSubscription } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { pushSupport, subscribeToPush } from "@/lib/push-client";
import { toAr, peopleAhead } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

const TERMINAL = new Set(["seated", "cancelled", "expired", "no_show"]);

// الوتيرة المتدرّجة حسب موقع العميل (عدد من أمامه)
// مع عشوائية ±٢٠٪: ذروة الخليج متزامنة (٧–١٠ مساء بنفس الساعة تقريبًا)،
// وبلا jitter كل من انضم بنفس اللحظة يسأل بنفس اللحظة فتضرب الخادمَ موجاتٌ
// متطابقة بدل تيار منتظم — نفس عدد الطلبات، لكن توزيعها هو الفرق.
function intervalFor(ahead: number): number {
  const base = ahead <= 2 ? 10_000   // ضمن أول ٣
             : ahead <= 9 ? 30_000   // من ٤ إلى ١٠
             : 60_000;               // أبعد من ١٠
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

export function QueueTicket({
  position,
  total,
  entryId,
  phone,
  restaurantName,
  onGone,
  restored,
}: {
  position: number;
  total: number;
  entryId?: string;
  phone?: string;
  restaurantName?: string;
  /** تُستدعى لإنهاء التذكرة والعودة لنموذج الانضمام (انتهت أو أراد دورًا جديدًا) */
  onGone?: () => void;
  /** تذكرة مسترجَعة من التخزين: لو كانت حالتها نهائية لا نعرضها أصلًا */
  restored?: boolean;
}) {
  const lang = useLang();
  const [pending, start] = useTransition();
  // مسار المسجّل يمرّر التذكرة بلا onGone — الزر كان يموت؛ إعادة التحميل مخرج دائم
  const goneOr = () => { if (onGone) onGone(); else if (typeof window !== "undefined") window.location.reload(); };

  // حالة حيّة (تُحدَّث بالاستطلاع) — pos هو الترتيب الحيّ = عدد من أمامك + 1
  const [status, setStatus] = useState<string>("waiting");
  const [pos, setPos] = useState<number>(position);
  const [ahead, setAhead] = useState<number>(Math.max(position - 1, 0));
  const [liveTotal, setLiveTotal] = useState<number>(total);
  // مسترجَعة من التخزين تبدأ بأصفار — لا نعرض «أنت التالي» الكاذبة قبل أول نبضة
  const [hasLive, setHasLive] = useState(!restored);

  // آخر إشعار أُطلق (منعًا للتكرار): 'notified' | 'next' | 'seated'
  const alertedRef = useRef<string>("");

  // إشعار المتصفّح (banner فوق) — يظهر لحظة ينبّهك المطعم أو يجي دورك.
  // ملاحظة: يعمل والصفحة مفتوحة (أو عند العودة إليها)؛ الإشعار في الخلفية التامّة
  // يحتاج Web Push (service worker + خادم) — خطوة لاحقة إن رغبت.
  function fireAlert(key: string, title: string, body: string) {
    if (alertedRef.current === key) return;
    alertedRef.current = key;
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, icon: "/icon-192.png", tag: "turn-queue" });
      }
    } catch {
      /* بعض المتصفّحات (iOS Safari) لا تدعم المُنشئ مباشرة — نتجاهل بهدوء */
    }
  }

  // حالة إشعارات الدفع: تُفعَّل بضغطة من العميل (المتصفّحات تشترط إيماءة)
  const [pushOn, setPushOn] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [canPush, setCanPush] = useState(false);

  // الجهاز قد يكون مشتركًا من دورٍ سابق، لكن الاشتراك في القاعدة مربوط بعميل ذلك
  // الدور. فنعيد ربطه بصاحب الدور الحالي دائمًا — وإلا ظهر «مفعّل» ولا يصل شيء.
  useEffect(() => {
    if (pushSupport() !== "ready") return;
    setCanPush(true);
    if (!entryId || !phone) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!sub) return;
        const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return;
        // upsert على endpoint ⇒ يُعاد توجيه الاشتراك لعميل هذا الدور
        const ok = await savePushSubscription(entryId, phone, {
          endpoint: j.endpoint,
          p256dh: j.keys.p256dh,
          auth: j.keys.auth,
        });
        setPushOn(ok);
      } catch {
        /* تجاهُل: الإشعارات لا تُعطّل الطابور */
      }
    })();
  }, [entryId, phone]);

  async function enablePush() {
    if (!entryId || !phone) return;
    setPushBusy(true);
    const sub = await subscribeToPush();
    if (sub) {
      const ok = await savePushSubscription(entryId, phone, sub);
      setPushOn(ok);
      if (!ok) setActErr(tr(lang, "تعذّر تفعيل التنبيه — حاول ثانية", "Couldn't enable alerts — try again"));
    } else {
      setActErr(tr(lang, "الإشعارات مرفوضة في متصفحك — اسمح بها من إعدادات الموقع ثم أعد المحاولة", "Notifications are blocked — allow them in site settings, then retry"));
    }
    setPushBusy(false);
  }

  // استطلاع خفيف بلا Realtime: setTimeout متكيّف + إيقاف عند الخمول + تنظيف + تباعد عند الفشل
  useEffect(() => {
    if (!entryId || !phone) return;
    let stopped = false;
    let fails = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const supabase = createClient();
    const venue = restaurantName?.trim() || tr(lang, "المطعم", "the restaurant");

    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const schedule = (ms: number) => { clear(); timer = setTimeout(tick, ms); };

    const tick = async () => {
      if (stopped || (typeof document !== "undefined" && document.hidden)) return;
      try {
        const { data, error } = await supabase.rpc("waitlist_ticket_status", {
          p_entry_id: entryId,
          p_phone: phone,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) { stopped = true; clear(); goneOr(); return; }   // الصف غير موجود → توقّف
        fails = 0;
        setHasLive(true);
        setStatus(row.status);
        setPos(row.position);
        setAhead(row.ahead);
        setLiveTotal(row.total ?? 0);

        // إشعار العميل (banner فوق) عند اللحظات المهمّة — مرّة واحدة لكل حالة
        if (row.status === "seated") {
          fireAlert("seated", tr(lang, "تفضّل، دورك جاهز 🎉", "You're up 🎉"), tr(lang, `توجّه إلى الاستقبال في ${venue}.`, `Head to reception at ${venue}.`));
        } else if (row.status === "notified") {
          fireAlert("notified", tr(lang, "دورك اقترب 🔔", "Your turn is near 🔔"), tr(lang, `نبّهك ${venue} — استعدّ للحضور.`, `${venue} alerted you — get ready.`));
        } else if (row.ahead === 0) {
          fireAlert("next", tr(lang, "أنت التالي 🟢", "You're next 🟢"), tr(lang, `لم يبقَ أحد أمامك في ${venue}.`, `No one ahead of you at ${venue}.`));
        }

        if (TERMINAL.has(row.status)) { stopped = true; clear(); return; }  // حالة نهائية
        schedule(intervalFor(row.ahead));
      } catch {
        // فشل/شبكة: تباعد متزايد بلا خطأ مزعج
        fails = Math.min(fails + 1, 4);
        schedule(Math.min(5_000 * 2 ** (fails - 1), 60_000)); // 5s,10s,20s,40s,60s
      }
    };

    const onVis = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) clear();               // خمول التبويب → إيقاف تام
      else if (!stopped) tick();                  // العودة → نبضة فورية ثم جدولة
    };

    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) tick();                 // نبضة فورية: يظهر الترتيب الحيّ فورًا لا بعد ثوانٍ

    return () => {
      stopped = true;
      clear();
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, phone, restaurantName, lang]);

  // تذكرة مسترجَعة انتهت حالتها → لا نحبس العميل على شاشة قديمة، نعيده للنموذج
  useEffect(() => {
    if (restored && TERMINAL.has(status)) goneOr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, status]);

  /** المخرج من أي حالة نهائية — كان غيابه يمنع أخذ دور جديد نهائيًّا */
  const RestartButton = () => (
    <button type="button" onClick={goneOr}
      className="mt-1 w-full rounded-2xl px-4 py-3 text-sm font-extrabold text-cream-100"
      style={{ background: "var(--brand-solid)" }}>
      {tr(lang, "خذ دورًا جديدًا", "Take a new turn")}
    </button>
  );

  // إلغاء يدوي من العميل
  const cancelled = status === "cancelled";
  const expired = status === "expired" || status === "no_show";
  const seated = status === "seated";

  if (cancelled) {
    return (
      <div className="rq-card flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full text-3xl text-cream-100" style={{ background: "var(--brand-solid)" }}>✓</span>
        <p className="text-lg font-extrabold text-[color:var(--ink)]">{tr(lang, "تم إلغاء دورك", "Your turn was cancelled")}</p>
        <p className="text-sm text-[color:var(--muted)]">{tr(lang, "تقدر تأخذ دورك من جديد وقت ما تحب.", "You can take a new turn whenever you like.")}</p>
        <RestartButton />
      </div>
    );
  }

  if (expired) {
    return (
      <div className="rq-card flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "rgba(102,28,10,0.10)", color: "var(--brand-d)" }}>⌛</span>
        <p className="text-lg font-extrabold text-[color:var(--ink)]">{tr(lang, "انتهى دورك", "Your turn expired")}</p>
        <p className="text-sm text-[color:var(--muted)]">{tr(lang, "تقدر تأخذ دورك من جديد وقت ما تحب.", "You can take a new turn whenever you like.")}</p>
        <RestartButton />
      </div>
    );
  }

  if (seated) {
    return (
      <div className="rq-card flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full text-3xl text-cream-100" style={{ background: "var(--brand-solid)" }}>🎉</span>
        <p className="font-display text-2xl font-extrabold text-[color:var(--ink)]">{tr(lang, "تفضّل، دورك جاهز", "You're up — please come in")}</p>
        <p className="text-sm text-[color:var(--muted)]">{tr(lang, "توجّه إلى الاستقبال. بالهناء والشفاء 🌿", "Head to the reception. Enjoy your visit 🌿")}</p>
        <RestartButton />
      </div>
    );
  }

  const denom = Math.max(liveTotal, pos, 1);
  const progress = Math.min(Math.max((denom - ahead) / denom, 0.08), 1);
  const R = 54;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - progress);

  return (
    <div className="rq-card flex flex-col items-center gap-5 p-8 text-center">
      {/* دائرة الرقم مع حلقة تقدّم ونبض حيّ */}
      <div className="relative flex h-44 w-44 items-center justify-center">
        <span
          className="absolute inset-4 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(150,45,20,0.20), transparent 70%)", animation: "turn-pulse 2.6s ease-out infinite" }}
        />
        <svg width="176" height="176" viewBox="0 0 128 128" className="absolute inset-0 -rotate-90">
          <defs>
            <linearGradient id="greenring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--brand-solid)" />
              <stop offset="100%" stopColor="var(--brand-solid)" />
            </linearGradient>
          </defs>
          <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(150,45,20,0.16)" strokeWidth="7" />
          <circle
            cx="64" cy="64" r={R} fill="none"
            stroke="url(#greenring)" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 700ms ease" }}
          />
        </svg>
        <div className="flex flex-col items-center">
          <span className="font-display text-6xl font-bold text-brand-700 leading-none">{pos ? toAr(pos) : "—"}</span>
          <span className="mt-1 text-xs font-bold tracking-widest text-[color:var(--muted)]">{tr(lang, "رقم دورك", "Your turn number")}</span>
        </div>
      </div>

      <div>
        <p className="font-display text-2xl font-bold text-[color:var(--ink)]">{hasLive ? peopleAhead(ahead, lang) : tr(lang, "جارٍ تحديث دورك…", "Syncing your turn…")}</p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {ahead === 0 ? tr(lang, "استعد — جاي دورك", "Get ready — your turn is coming") : tr(lang, "راقب رقمك، وننبّهك قبل دورك", "Keep an eye on your number, we'll alert you before your turn")}
        </p>
      </div>

      {/* أهم معلومتين للعميل الواقف */}
      <div className="grid w-full grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[color:var(--surface-2)] p-4">
          <p className="text-2xl font-extrabold text-brand-700">{!hasLive ? "…" : ahead === 0 ? tr(lang, "التالي", "Next") : toAr(ahead)}</p>
          <p className="mt-1 text-xs text-[color:var(--muted)]">{ahead === 0 ? tr(lang, "أنت", "You") : tr(lang, "أمامك بالطابور", "Ahead of you in queue")}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[color:var(--surface-2)] p-4">
          <p className="text-2xl font-extrabold text-brand-700">{hasLive ? toAr(liveTotal) : "…"}</p>
          <p className="mt-1 text-xs text-[color:var(--muted)]">{tr(lang, "إجمالي الطابور", "Total in queue")}</p>
        </div>
      </div>

      {/* تنبيه الدور — يصل والتطبيق مُغلق */}
      {entryId && phone && canPush && (
        pushOn ? (
          <p className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-cream-100"
             style={{ background: "var(--brand-solid)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {tr(lang, "بننبّهك على جوّالك قبل دورك", "We'll alert your phone before your turn")}
          </p>
        ) : (
          <button
            type="button"
            onClick={enablePush}
            disabled={pushBusy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-extrabold text-cream-100 transition active:scale-[0.985] disabled:opacity-60"
            style={{ background: "var(--brand-solid)", boxShadow: "0 14px 26px -16px rgba(102,28,10,0.72)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {pushBusy ? tr(lang, "جارٍ التفعيل…", "Enabling…") : tr(lang, "نبّهني قبل دوري", "Alert me before my turn")}
          </button>
        )
      )}

      {actErr && (
        <p className="w-full rounded-2xl px-3 py-2 text-xs font-bold text-[color:var(--danger)]" style={{ background: "rgba(200,70,70,0.08)" }}>{actErr}</p>
      )}
      {entryId && phone && (
        <button
          onClick={() => start(async () => {
            if (await cancelWaitlistGuest(entryId, phone)) { setActErr(null); setStatus("cancelled"); }
            else setActErr(tr(lang, "تعذّر الإلغاء — ربما تغيّرت حالة دورك، حدّث الصفحة", "Couldn't cancel — your turn may have changed; refresh the page"));
          })}
          disabled={pending}
          className="mt-1 h-11 w-full rounded-2xl border text-sm font-bold text-[color:var(--muted)] transition hover:text-[color:var(--danger)]"
          style={{ borderColor: "rgba(200,70,70,0.28)" }}
        >
          {pending ? tr(lang, "جارٍ الإلغاء…", "Cancelling…") : tr(lang, "إلغاء دوري", "Cancel my turn")}
        </button>
      )}
    </div>
  );
}
