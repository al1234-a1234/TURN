"use client";

import { useActionState, useEffect, useState } from "react";
import { submitReview, type ReviewState } from "./actions";
import { normalizePhone } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

/**
 * كتابة التقييم من صفحة المطعم — كانت التقييمات تُعرض بلا أي مسار لإنشائها.
 * الحارس الحقيقي في القاعدة (زيارة فعلية خلال ٧ أيام)؛ النموذج هنا للتجربة فقط.
 */
export function ReviewForm({ slug, googleUrl }: { slug: string; googleUrl?: string | null }) {
  const lang = useLang();
  const [state, action, pending] = useActionState<ReviewState, FormData>(submitReview, { ok: false });
  const [stars, setStars] = useState(0);
  const [phone, setPhone] = useState("");

  // رقم العميل المحفوظ من دورة سابقة — تعبئة بعد الترطيب (بلا عدم تطابق SSR)
  useEffect(() => {
    try {
      const p = localStorage.getItem("turn:phone");
      if (p) setPhone(normalizePhone(p).slice(0, 10));
    } catch { /* تجاهُل */ }
  }, []);

  if (state.ok) {
    return (
      <div className="rq-card space-y-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: "var(--brand-solid)" }}>✓</span>
          <p className="text-sm font-bold text-[color:var(--ink)]">{tr(lang, "وصل تقييمك — شكرًا لك 🌿", "Your review is in — thank you 🌿")}</p>
        </div>
        {/* التوجيه الذكي فعليًّا: الراضي (٤★+) يُدعى لنشره في خرائط Google */}
        {stars >= 4 && googleUrl && (
          <a href={googleUrl} target="_blank" rel="noreferrer"
             className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold text-white"
             style={{ background: "var(--brand-solid)" }}>
            ⭐ {tr(lang, "أسعدتنا! انشر تقييمك في خرائط Google", "Made our day! Share it on Google Maps")}
          </a>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="rq-card space-y-3 p-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="rating" value={stars} />
      <p className="font-display text-base font-bold text-[color:var(--ink)]">{tr(lang, "قيّم تجربتك", "Rate your experience")}</p>

      <div className="flex gap-1.5" dir="ltr">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setStars(n)} aria-label={`${n}`}
            className="text-3xl transition active:scale-90"
            style={{ color: n <= stars ? "var(--brand-d)" : "rgba(102,28,10,0.22)" }}>
            ★
          </button>
        ))}
      </div>

      <input
        name="phone" dir="ltr" inputMode="numeric" maxLength={10} required
        value={phone} onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 10))}
        placeholder="05xxxxxxxx" className="field-input text-left"
      />
      <textarea name="comment" rows={2} maxLength={500}
        placeholder={tr(lang, "شاركنا رأيك (اختياري)", "Share your thoughts (optional)")} className="field-input resize-none" />

      {state.error && (
        <p className="rounded-2xl border border-[rgba(200,70,70,0.3)] bg-[rgba(200,70,70,0.06)] px-3 py-2.5 text-xs font-medium text-red-600">{state.error}</p>
      )}

      <button type="submit" disabled={pending || stars === 0 || !/^05\d{8}$/.test(phone)} className="rq-btn !h-11 text-sm">
        {pending ? tr(lang, "جارٍ الإرسال…", "Sending…") : tr(lang, "أرسل التقييم", "Send review")}
      </button>
      <p className="text-[11px] text-[color:var(--muted)]">{tr(lang, "التقييم لمن زار فعلًا خلال آخر ٧ أيام — نتحقّق برقم جوّالك.", "Reviews are for actual visitors within the last 7 days — verified by your phone.")}</p>
    </form>
  );
}
