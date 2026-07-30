"use client";

import { useEffect, useState, useTransition } from "react";
import { claimOffer, type ClaimState } from "./offer-actions";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";
import { normalizePhone } from "@/lib/format";

/**
 * «استخدم العرض» — كان العرض لوحة إعلانية بلا أي مسار استخدام:
 * الآن يفعّله العميل برقمه فيصدر له رمز يعتمده الكاشير، ويُسجَّل الاستخدام
 * للمطعم (كان عدّاد «مرات الاستخدام» صفرًا أبديًّا).
 */
export function OfferClaim({ offerId }: { offerId: string }) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [known, setKnown] = useState(false);
  const [state, setState] = useState<ClaimState | null>(null);
  const [pending, start] = useTransition();

  // رقم العميل يُحفظ مرّة واحدة: من يعرفه النظام لا يُسأل مجددًا عند كل عرض
  useEffect(() => {
    try {
      const p = localStorage.getItem("turn:phone");
      if (p) { const n = normalizePhone(p).slice(0, 10); if (/^05\d{8}$/.test(n)) { setPhone(n); setKnown(true); } }
    } catch { /* تجاهُل */ }
  }, []);

  function submit(p: string) {
    start(async () => {
      const r = await claimOffer(offerId, p);
      setState(r);
      if (r.ok) { try { localStorage.setItem("turn:phone", p); } catch { /* تجاهُل */ } }
    });
  }

  if (state?.ok) {
    return (
      <div className="shrink-0 text-center">
        <p className="text-[10px] font-extrabold text-[color:var(--muted)]">{tr(lang, "رمزك للكاشير", "Your counter code")}</p>
        <p dir="ltr" className="rounded-lg bg-brand-800 px-2.5 py-1 font-display text-sm font-extrabold tracking-widest text-cream-100">{state.code}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button"
              disabled={pending}
              onClick={() => { if (known) submit(phone); else setOpen(true); }}
              className="shrink-0 rounded-xl px-3.5 py-2 text-xs font-extrabold text-white disabled:opacity-60"
              style={{ background: "var(--brand-solid)" }}>
        {pending ? "…" : tr(lang, "استخدمه", "Claim")}
      </button>
    );
  }

  const valid = /^05\d{8}$/.test(phone);
  return (
    <div className="shrink-0">
      <div className="flex items-center gap-1.5">
        <input
          value={phone}
          onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 10))}
          dir="ltr" inputMode="numeric" maxLength={10}
          className="w-32 rounded-xl border px-2.5 py-2 text-left text-xs font-bold"
          style={{ borderColor: "rgba(102,28,10,0.2)", background: "var(--surface)" }}
          placeholder="05xxxxxxxx"
          autoFocus
        />
        <button
          type="button"
          disabled={pending || !valid}
          onClick={() => submit(phone)}
          className="rounded-xl px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50"
          style={{ background: "var(--brand-solid)" }}
        >
          {pending ? "…" : tr(lang, "تفعيل", "Get")}
        </button>
      </div>
      {state && !state.ok && state.error && (
        <p className="mt-1 max-w-[180px] text-[10px] font-bold" style={{ color: "#c0564a" }}>{state.error}</p>
      )}
    </div>
  );
}
