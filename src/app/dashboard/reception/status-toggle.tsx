"use client";

import { useState, useTransition } from "react";
import { setBranchJoinFrozen, setBranchQueuePaused, setBranchStatus, type JoinFrozenReason } from "./status-actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { ToggleSwitch } from "@/components/toggle-switch";

/**
 * تحكّم تشغيلي سريع بحالة الفرع — للاستقبال والمالك معًا، بلا حاجة لصلاحية
 * "الإعدادات" الكاملة: إغلاق فوري يوقف الانضمام تمامًا، و"مزدحم الآن" مؤشّر
 * فقط لا يمنع أحدًا. تحديث متفائل فورًا ثم مزامنة مع الخادم بالخلفية.
 */
export function StatusToggle({
  branchId,
  closedNow,
  busyNow,
  closedByHours,
  queuePaused = false,
  joinFrozen = false,
  joinFrozenReason = null,
}: {
  branchId: string;
  closedNow: boolean;
  busyNow: boolean;
  /** الفرع مغلق حاليًا حسب أوقات الدوام المضبوطة (لا يدويًّا) — إعلامي فقط. */
  closedByHours: boolean;
  /** مفتوحٌ بلا طابور: يُعرض ويُزار، ولا يقبل دورًا جديدًا. */
  queuePaused?: boolean;
  /** إيقاف الانضمام المؤقّت: يمنع كلّ جديدٍ ويريه «ممتلئ»، بلا لمس القائمين. */
  joinFrozen?: boolean;
  /** أيّ رسالةٍ يقرؤها الضيف: اكتمل اليوم، أم ازدحامٌ عابر. */
  joinFrozenReason?: JoinFrozenReason | null;
}) {
  const lang = useLang();
  const [closed, setClosed] = useState(closedNow);
  const [busy, setBusy] = useState(busyNow);
  const [paused, setPaused] = useState(queuePaused);
  const [frozen, setFrozen] = useState(joinFrozen);
  const [reason, setReason] = useState<JoinFrozenReason | null>(joinFrozenReason);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  function togglePaused() {
    const prev = paused;
    setPaused(!prev);
    start(async () => {
      const ok = await setBranchQueuePaused(branchId, !prev);
      if (!ok) { setPaused(prev); setErr(true); } else setErr(false);
    });
  }

  /** إيقافٌ بسببٍ مسمّى — السبب هو ما يقرؤه الضيف، فلا يُترك للتخمين. */
  function freezeWith(next: JoinFrozenReason) {
    const prev = { frozen, reason };
    setFrozen(true); setReason(next);
    start(async () => {
      const ok = await setBranchJoinFrozen(branchId, true, next);
      if (!ok) { setFrozen(prev.frozen); setReason(prev.reason); setErr(true); } else setErr(false);
    });
  }

  function unfreeze() {
    const prev = { frozen, reason };
    setFrozen(false); setReason(null);
    start(async () => {
      const ok = await setBranchJoinFrozen(branchId, false);
      if (!ok) { setFrozen(prev.frozen); setReason(prev.reason); setErr(true); } else setErr(false);
    });
  }

  function toggle(nextClosed: boolean, nextBusy: boolean) {
    const prev = { closed, busy };
    setClosed(nextClosed);
    setBusy(nextBusy);
    start(async () => {
      // فشل الخادم (لا حقّ على الفرع/شبكة) → نتراجع بدل واجهةٍ تكذب:
      // «مغلق» معروضًا والفرع مفتوح فعليًّا في القاعدة
      const ok = await setBranchStatus(branchId, nextClosed, nextBusy);
      if (!ok) { setClosed(prev.closed); setBusy(prev.busy); setErr(true); }
      else setErr(false);
    });
  }

  return (
    <div className="soft-card mb-5 grid gap-2.5 p-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {/* ── الشكل موحّد، والمنطق كما هو حرفيًّا ──
          اتّجاه المفتاح يتبع ما يفهمه المضيف لا ما يخزّنه العمود: «الفرع
          مفتوح» و«الطابور مفتوح» مشتغلٌ حين يكون مفتوحًا (فالمطفأ يعني
          توقّفًا)، و«مزدحم الآن» مشتغلٌ حين تكون اللافتة معروضة. والمعالجات
          هي هي: toggle وtogglePaused بلا حرفٍ واحد تغيّر. */}
      <ToggleSwitch
        on={!closed}
        disabled={pending}
        onToggle={() => toggle(!closed, closed ? busy : false)}
        title={tr(lang, "الفرع مفتوح", "Branch is open")}
        hint={
          closed
            ? tr(lang, "مغلق يدويًّا — أمان النسيان: يُفتح تلقائيًّا فجر كل يوم", "Manually closed — forget-safe: reopens automatically at dawn")
            : closedByHours
              ? tr(lang, "⏱ خارج أوقات الدوام المضبوطة — يظهر للعميل مغلقًا تلقائيًا", "⏱ Outside configured hours — customers see it as closed automatically")
              : tr(lang, "أطفئه ليُغلق الفرع فورًا أمام العملاء.", "Turn it off to close the branch to guests right away.")
        }
      />

      {/* «بدون انتظار» — مفتوحٌ ويستقبل، بلا دور. يُعطَّل حين يكون الفرع مقفلًا
          أصلًا: لا معنى لإيقاف طابورٍ في فرعٍ لا يُرى. */}
      <ToggleSwitch
        on={!paused}
        disabled={pending || closed}
        onToggle={togglePaused}
        title={tr(lang, "الطابور مفتوح", "Queue is open")}
        hint={
          paused
            ? tr(lang, "الفرع معروض ويستقبل — والداخل يدخل مباشرة.", "The branch stays visible and seating — guests walk right in.")
            : tr(lang, "يُلغى تلقائيًّا فجر كلّ يوم.", "Clears automatically at dawn.")
        }
      />

      <ToggleSwitch
        on={busy}
        disabled={pending || closed}
        onToggle={() => toggle(closed, !busy)}
        title={tr(lang, "مزدحم الآن", "Busy now")}
        hint={tr(lang, "لافتةٌ للعميل فقط — لا تمنع دورًا ولا تُغلق شيئًا.", "A label for guests only — it blocks nothing.")}
      />

      {/* ── الحالة الثالثة: «إيقاف الانضمام الجديد» ──
          صفٌّ مستقلٌّ بعرضٍ كامل، ولونُ اشتغالٍ أحمر (tone=danger)، كي لا يُخلط
          بـ«الطابور مفتوح» الأخضر بجانبه. اشتغالُه هو حالة التنبيه — عكس
          أخويه — فيُرى قبل أن يُقرأ. يمنع الجديد ويُريه «الطابور ممتلئ»، ولا
          يمسّ من في الطابور، ولا يُفتح تلقائيًّا. يُعطَّل حين يكون الفرع مقفلًا
          أصلًا (لا انضمام في فرعٍ لا يُرى). */}
      {/* ── الحالة الثالثة: إيقافٌ بسببٍ مسمّى ──
          صار الزرّ خيارين لأنّ السببين يقولان للضيف شيئين متعاكسين: «اكتمل
          اليوم» تصرفه لغدٍ، و«مزدحمٌ مؤقّتًا» تُبقيه يجرّب بعد دقائق. ورسالةٌ
          واحدة لهما كانت تُضيّع نصف الضيوف في الانتظار والنصف الآخر بالانصراف.
          المفتاح الواحد لا يحمل سببًا — فصار الاختيار صريحًا عند الضغط. */}
      {!frozen ? (
        <div className="grid gap-2.5 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">
          <button
            type="button"
            disabled={pending || closed}
            onClick={() => freezeWith("done_today")}
            className="rounded-2xl px-4 py-3.5 text-start text-sm font-extrabold transition disabled:opacity-50"
            style={{ background: "rgba(192,86,74,0.12)", color: "var(--st-closed)", border: "1px solid var(--border)" }}
          >
            <span className="block">{tr(lang, "أوقف: اكتملت اليوم", "Stop: done for today")}</span>
            <span className="mt-1 block text-[11px] font-bold opacity-80">
              {tr(lang, "يقرأ الضيف: «اكتملت حجوزات اليوم»", "Guest reads: “Today's bookings are full”")}
            </span>
          </button>
          <button
            type="button"
            disabled={pending || closed}
            onClick={() => freezeWith("temporary")}
            className="rounded-2xl px-4 py-3.5 text-start text-sm font-extrabold transition disabled:opacity-50"
            style={{ background: "rgba(169,114,30,0.12)", color: "var(--st-full)", border: "1px solid var(--border)" }}
          >
            <span className="block">{tr(lang, "أوقف: مزدحمٌ مؤقّتًا", "Stop: busy right now")}</span>
            <span className="mt-1 block text-[11px] font-bold opacity-80">
              {tr(lang, "يقرأ الضيف: «المطعم مزدحمٌ حاليًا»", "Guest reads: “We're busy right now”")}
            </span>
          </button>
        </div>
      ) : (
        <div className="sm:col-span-2 lg:col-span-3">
          <ToggleSwitch
            on
            tone="danger"
            disabled={pending}
            onToggle={unfreeze}
            title={tr(lang, "الانضمام موقوف", "Sign-ups stopped")}
            hint={
              reason === "done_today"
                ? tr(lang,
                    "الضيف الجديد يقرأ: «اكتملت حجوزات اليوم». من في الطابور يبقى ويُخدم. لا يُفتح تلقائيًّا؛ أطفئه لتعيد القبول.",
                    "New guests read: “Today's bookings are full.” Those already in line stay and are served. It won't reopen on its own; turn it off to accept again.")
                : tr(lang,
                    "الضيف الجديد يقرأ: «المطعم مزدحمٌ حاليًا». من في الطابور يبقى ويُخدم. لا يُفتح تلقائيًّا؛ أطفئه لتعيد القبول.",
                    "New guests read: “We're busy right now.” Those already in line stay and are served. It won't reopen on its own; turn it off to accept again.")
            }
          />
        </div>
      )}

      {err && (
        <span className="text-xs font-extrabold text-[color:var(--danger)] sm:col-span-2 lg:col-span-3">
          {tr(lang, "تعذّر الحفظ — حدّث الصفحة وحاول ثانية", "Couldn't save — refresh and retry")}
        </span>
      )}
    </div>
  );
}
