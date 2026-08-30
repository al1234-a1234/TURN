"use client";

import { useState, useTransition } from "react";
import { setBranchJoinFrozen, setBranchQueuePaused, setBranchStatus } from "./status-actions";
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
}: {
  branchId: string;
  closedNow: boolean;
  busyNow: boolean;
  /** الفرع مغلق حاليًا حسب أوقات الدوام المضبوطة (لا يدويًّا) — إعلامي فقط. */
  closedByHours: boolean;
  /** مفتوحٌ بلا طابور: يُعرض ويُزار، ولا يقبل دورًا جديدًا. */
  queuePaused?: boolean;
  /** إيقاف الانضمام المؤقّت: يمنع كلّ جديدٍ ويريه «الطابور ممتلئ»، بلا لمس القائمين. */
  joinFrozen?: boolean;
}) {
  const lang = useLang();
  const [closed, setClosed] = useState(closedNow);
  const [busy, setBusy] = useState(busyNow);
  const [paused, setPaused] = useState(queuePaused);
  const [frozen, setFrozen] = useState(joinFrozen);
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

  function toggleFrozen() {
    const prev = frozen;
    setFrozen(!prev);
    start(async () => {
      const ok = await setBranchJoinFrozen(branchId, !prev);
      if (!ok) { setFrozen(prev); setErr(true); } else setErr(false);
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
      <div className="sm:col-span-2 lg:col-span-3">
        <ToggleSwitch
          on={frozen}
          tone="danger"
          disabled={pending || closed}
          onToggle={toggleFrozen}
          title={tr(lang, "إيقاف الانضمام الجديد", "Stop new sign-ups")}
          hint={
            frozen
              ? tr(lang,
                  "موقوف يدويًّا — العميل الجديد يرى «الطابور ممتلئ حاليًا». من في الطابور يبقى ويُخدم. لا يُفتح تلقائيًّا؛ أطفئه لتعيد القبول.",
                  "Stopped manually — new guests see “The queue is full right now.” Those already in line stay and are served. It won't reopen on its own; turn it off to accept again.")
              : tr(lang,
                  "الفرع يقبل أدوارًا جديدة. شغّله لإيقاف الانضمام فورًا مع بقاء من في الطابور — بلا تأثيرٍ على من ينتظر.",
                  "The branch is accepting new sign-ups. Turn it on to stop new joins at once while everyone already in line stays.")
          }
        />
      </div>

      {frozen && (
        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold sm:col-span-2 lg:col-span-3"
          style={{ background: "rgba(192,86,74,0.12)", color: "var(--st-closed)" }}
        >
          <span aria-hidden>⛔</span>
          <span>
            {tr(lang,
              "الانضمام موقوف الآن — العملاء الجدد يرون «الطابور ممتلئ حاليًا». لن يُفتح تلقائيًّا.",
              "Sign-ups are stopped — new guests see “The queue is full right now.” It won't reopen automatically.")}
          </span>
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
