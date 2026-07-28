"use client";

import { toAr } from "@/lib/format";
import { tr, type Lang } from "@/lib/i18n";

/**
 * بطاقة الأختام — «٤ زيارات والخامسة هدية» بصريًّا لا رقميًّا.
 * تُشتق من برنامج الولاء نفسه: عدد الخانات = العتبة ÷ نقاط الزيارة.
 * إن لم يكن البرنامج زياراتيًّا نظيفًا (قسمة غير صحيحة أو خانات كثيرة)
 * نرجع لشريط التقدّم — البطاقة تكذب لو أجبرناها على نموذج لا يطابقها.
 */

export function stampSlots(threshold: number, perVisit: number): number | null {
  if (perVisit <= 0 || threshold <= 0) return null;
  if (threshold % perVisit !== 0) return null;
  const slots = threshold / perVisit;
  return slots >= 2 && slots <= 12 ? slots : null;
}

export function StampCard({ points, threshold, perVisit, reward, lang }: {
  points: number; threshold: number; perVisit: number; reward: string | null; lang: Lang;
}) {
  const slots = stampSlots(threshold, perVisit);
  const oneAway = points >= threshold - perVisit && points < threshold;

  if (slots === null) {
    // برنامج نقاطي حرّ: الشريط أصدق من أختام مفتعلة
    const pct = Math.min(100, Math.round((points / threshold) * 100));
    return (
      <div>
        <div className="flex items-center justify-between text-[13px] font-bold text-[color:var(--ink)]">
          <span>{tr(lang, "نقاطك هنا", "Your points here")}</span>
          <span dir="ltr">{toAr(points)} / {toAr(threshold)}</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(102,28,10,0.12)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#b23c1d,#661c0a)" }} />
        </div>
        <Caption points={points} threshold={threshold} oneAway={oneAway} reward={reward} lang={lang} />
      </div>
    );
  }

  const filled = Math.min(slots, Math.floor(points / perVisit));
  return (
    <div>
      <div className="flex items-center justify-between text-[13px] font-bold text-[color:var(--ink)]">
        <span>{tr(lang, "بطاقة أختامك", "Your stamp card")}</span>
        <span dir="ltr">{toAr(filled)} / {toAr(slots)}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2" dir="ltr">
        {Array.from({ length: slots }, (_, i) => {
          const isFilled = i < filled;
          const isReward = i === slots - 1;
          return (
            <span
              key={i}
              className="flex h-10 w-10 items-center justify-center rounded-full text-base font-extrabold transition"
              style={isFilled
                ? { background: "linear-gradient(155deg,#b23c1d,#661c0a)", color: "#fdf6ef", boxShadow: "0 6px 14px -8px rgba(102,28,10,0.8)" }
                : { background: "rgba(102,28,10,0.07)", color: "rgba(102,28,10,0.45)", border: "2px dashed rgba(102,28,10,0.25)" }}
              aria-label={isFilled ? tr(lang, "زيارة مسجّلة", "Stamped visit") : tr(lang, "زيارة متبقية", "Remaining visit")}
            >
              {isReward ? "🎁" : isFilled ? "✓" : toAr(i + 1)}
            </span>
          );
        })}
      </div>
      <Caption points={points} threshold={threshold} oneAway={oneAway} reward={reward} lang={lang} />
    </div>
  );
}

function Caption({ points, threshold, oneAway, reward, lang }: {
  points: number; threshold: number; oneAway: boolean; reward: string | null; lang: Lang;
}) {
  if (points >= threshold) {
    return (
      <p className="mt-2 text-[12px] font-bold text-[color:var(--muted)]">
        {tr(lang, "🎉 وصلت! مكافأتك تنزل مع زيارتك", "🎉 You made it! Your reward lands with your visit")}
      </p>
    );
  }
  if (oneAway) {
    return (
      <p className="mt-2 rounded-xl px-3 py-2 text-center text-[13px] font-extrabold"
         style={{ background: "rgba(178,60,29,0.1)", color: "var(--brand-d)" }}>
        🔥 {tr(lang, `باقي زيارة واحدة على ${reward || "هديتك"}!`, `One visit left to ${reward || "your reward"}!`)}
      </p>
    );
  }
  return (
    <p className="mt-2 text-[12px] font-bold text-[color:var(--muted)]">
      {tr(lang, `باقي ${toAr(threshold - points)} نقطة على ${reward || "مكافأتك"}`,
               `${toAr(threshold - points)} points to ${reward || "your reward"}`)}
    </p>
  );
}
