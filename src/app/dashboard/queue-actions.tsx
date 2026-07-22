"use client";

import { useTransition } from "react";
import { updateWaitlistStatus } from "./waitlist-actions";

// تحويل رقم سعودي إلى صيغة واتساب الدولية
function waNumber(phone: string): string {
  let p = (phone || "").replace(/\D/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "966" + p.slice(1);
  else if (p.startsWith("5") && p.length === 9) p = "966" + p;
  return p;
}

export function QueueActions({
  id,
  name,
  phone,
  restaurant,
  position,
}: {
  id: string;
  name: string;
  phone: string;
  restaurant: string;
  position: number | null;
}) {
  const [pending, start] = useTransition();

  function remind() {
    const num = waNumber(phone);
    const msg = `مرحبًا ${name} 👋\nدورك رقم ${position ?? ""} في ${restaurant} أوشك أن يحين. نتشرّف بك — تفضّل للحضور 🌿`;
    const url = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
    start(async () => {
      await updateWaitlistStatus(id, "notified");
      window.open(url, "_blank");
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        onClick={remind}
        disabled={pending || !phone}
        title="تذكير واتساب"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--hairline)] bg-[rgba(37,211,102,0.12)] text-[#25D366] transition hover:bg-[rgba(37,211,102,0.2)] disabled:opacity-40"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-3-.8-2.5-1-4.1-3.6-4.2-3.8-.1-.2-1-1.3-1-2.5s.6-1.7.9-2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.4.6c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.2.1.4.1.6-.1l.7-.9c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.3.1.7-.1 1.3Z" />
        </svg>
      </button>
      <button
        disabled={pending}
        onClick={() => start(() => updateWaitlistStatus(id, "seated"))}
        className="rounded-xl px-3 py-2 text-xs font-bold text-[color:var(--bg)] transition disabled:opacity-60"
        style={{ background: "linear-gradient(160deg,#357a57,#1d4733)" }}
      >
        جلوس
      </button>
      <button
        disabled={pending}
        onClick={() => start(() => updateWaitlistStatus(id, "cancelled"))}
        className="rounded-xl border border-[var(--hairline)] px-3 py-2 text-xs font-bold text-[color:var(--muted)] transition hover:text-red-600 disabled:opacity-60"
      >
        إزالة
      </button>
    </div>
  );
}
