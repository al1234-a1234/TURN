"use client";

import { useTransition } from "react";
import { updateWaitlistStatus } from "./waitlist-actions";
import { SwapButton } from "./reception/swap-selection";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

// تحويل رقم سعودي إلى صيغة واتساب الدولية
function waNumber(phone: string): string {
  let p = (phone || "").replace(/\D/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "966" + p.slice(1);
  else if (p.startsWith("5") && p.length === 9) p = "966" + p;
  return p;
}

// نفس التطبيع لصيغة tel: — دولية بـ+ عشان تطلب صح بصرف النظر عن إعدادات
// المنطقة بجهاز الموظّف (رقم محلي "05..." قد يُساء تفسيره على بعض الأجهزة)
function telHref(phone: string): string {
  return `tel:+${waNumber(phone)}`;
}

export function QueueActions({
  id,
  name,
  phone,
  restaurant,
  position,
  zone,
}: {
  id: string;
  name: string;
  phone: string;
  restaurant: string;
  position: number | null;
  /** قسم الدور — يلزم زرَّ التبديل ليمنع الاختيار عبر قسمين. اختياريّ:
   *  بدونه (أو خارج شاشة الاستقبال) لا يُعرض الزرّ أصلًا. */
  zone?: string | null;
}) {
  const lang = useLang();
  const [pending, start] = useTransition();

  function remind() {
    const num = waNumber(phone);
    // رابط التذكرة: يفتحها العميل فيؤكّد حضوره بضغطة، فيظهر ✓ للاستقبال
    const ticket = typeof window !== "undefined" ? `${window.location.origin}/t/${id}` : "";
    // رسالة العميل تبقى عربية دائمًا (العميل عربي)، بصرف النظر عن لغة لوحة الموظف
    const msg =
      `مرحبًا ${name} 👋\n` +
      `قرب دورك في ${restaurant} — رقمك ${position ?? ""}.\n\n` +
      `أكّد حضورك أو ألغِ دورك بضغطة 👇\n${ticket}\n\n` +
      `ما يحتاج ترد علينا — بس اختر من الرابط 🌿\n\n` +
      // سياسةُ المطعم تُقال للضيف، ولا يقابلها في النظام مؤقّتٌ ولا تحرير
      // تلقائيّ — ولا يُبنى: الطاولة ينقلها الاستقبال بيده كما يفعل اليوم.
      // نصٌّ فقط، كي يفهم الضيف لماذا قد يمضي دورُه إن تأخّر.
      `ملاحظة: زبائننا الأعزاء، في حال عدم تأكيد الحجز خلال ١٠ دقائق، تنتقل الطاولة للشخص التالي في الطابور تلقائيًا.`;
    const url = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
    // افتح واتساب أولًا — لو أغلق الموظّف نافذة المشاركة لا يُوسَم الضيف
    // «أُشعِر ✓» وهو لم يستلم شيئًا
    const win = window.open(url, "_blank");
    if (!win) return;
    start(async () => {
      await updateWaitlistStatus(id, "notified");
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {/* تبديل الموضع مع دورٍ آخر — يظهر داخل شاشة الاستقبال وحدها (المزوّد
          موجودٌ هناك فقط)، وبنفس مقاس بقيّة أزرار البطاقة */}
      <SwapButton id={id} zone={zone ?? null} rank={position ?? 0} />
      {/* اتصال مباشر — طلب المشغّل: أحيانًا واتساب غير كافٍ (ضيفٌ لا يفتحه فورًا)
          وأسرع رد فعل هو مكالمة فعلية. tel: يفتح تطبيق الهاتف مباشرة على الجوّال. */}
      <a
        href={phone ? telHref(phone) : undefined}
        aria-disabled={!phone}
        title={tr(lang, "اتصال مباشر", "Call directly")}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hairline)] text-[color:var(--brand-d)] transition hover:bg-[rgba(102,28,10,0.08)] aria-disabled:pointer-events-none aria-disabled:opacity-40"
        style={{ background: "rgba(102,28,10,0.08)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4.5 4.5c0-1 .8-1.8 1.8-1.8h2c.8 0 1.5.5 1.7 1.3l1 3.2c.2.7 0 1.4-.5 1.9l-1.5 1.4c1 2.1 2.7 3.8 4.8 4.8l1.4-1.5c.5-.5 1.2-.7 1.9-.5l3.2 1c.8.2 1.3.9 1.3 1.7v2c0 1-.8 1.8-1.8 1.8C10.9 20.8 3.2 13.1 4.5 4.5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        </svg>
      </a>
      <button
        onClick={remind}
        disabled={pending || !phone}
        title={tr(lang, "تذكير واتساب", "WhatsApp reminder")}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hairline)] bg-[rgba(37,211,102,0.12)] text-[#25D366] transition hover:bg-[rgba(37,211,102,0.2)] disabled:opacity-40"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-3-.8-2.5-1-4.1-3.6-4.2-3.8-.1-.2-1-1.3-1-2.5s.6-1.7.9-2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.4.6c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.2.1.4.1.6-.1l.7-.9c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.3.1.7-.1 1.3Z" />
        </svg>
      </button>
      <button
        disabled={pending}
        onClick={() => start(async () => { await updateWaitlistStatus(id, "seated"); })}
        className="rounded-xl px-3 py-2 text-xs font-bold text-[color:var(--bg)] transition disabled:opacity-60"
        style={{ background: "var(--brand-solid)" }}
      >
        {tr(lang, "جلوس", "Seat")}
      </button>
      <button
        disabled={pending}
        onClick={() => start(async () => { await updateWaitlistStatus(id, "cancelled"); })}
        className="rounded-xl border border-[var(--hairline)] px-3 py-2 text-xs font-bold text-[color:var(--muted)] transition hover:text-[color:var(--danger)] disabled:opacity-60"
      >
        {tr(lang, "إزالة", "Remove")}
      </button>
    </div>
  );
}
