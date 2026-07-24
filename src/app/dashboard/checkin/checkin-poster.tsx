"use client";

import { useState } from "react";

// ملصق الباركود القابل للطباعة + نسخ الرابط
export function CheckinPoster({
  svg,
  name,
  link,
  labels,
}: {
  svg: string;
  name: string;
  link: string;
  labels: { scan: string; sub: string; print: string; copy: string; copied: string; poweredBy: string };
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div>
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .checkin-poster, .checkin-poster * { visibility: visible !important; }
        .checkin-poster { position: fixed; inset: 0; margin: auto; box-shadow: none !important; }
      }`}</style>

      {/* الملصق */}
      <div
        className="checkin-poster mx-auto max-w-sm rounded-3xl bg-white p-8 text-center"
        style={{ border: "1px solid rgba(102,28,10,0.14)", boxShadow: "0 20px 44px -28px rgba(102,28,10,0.5)" }}
      >
        <p className="font-display text-2xl font-bold text-[color:var(--brand-d)]">{name}</p>
        <p className="mt-4 font-display text-3xl font-extrabold text-[color:var(--ink)]">{labels.scan}</p>
        <p className="mt-1 text-sm font-bold text-[color:var(--muted)]">{labels.sub}</p>

        <div className="mx-auto mt-6 w-52" dangerouslySetInnerHTML={{ __html: svg }} />

        <p dir="ltr" className="mt-4 break-all text-[11px] font-bold text-[color:var(--muted)]">{link}</p>
        <p className="mt-4 text-[11px] font-bold tracking-widest text-[color:var(--brand-d)]">{labels.poweredBy}</p>
      </div>

      {/* أزرار (لا تُطبع) */}
      <div className="mt-4 flex gap-2">
        <button onClick={() => window.print()} className="btn btn-primary flex-1">{labels.print}</button>
        <button onClick={copy} className="btn btn-ghost flex-1">{copied ? labels.copied : labels.copy}</button>
      </div>
    </div>
  );
}
