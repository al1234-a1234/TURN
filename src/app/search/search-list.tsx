"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type SearchItem = { slug: string; name: string; logo?: string | null; city: string; cuisine: string };

export function SearchList({
  items,
  placeholder,
  emptyLabel,
}: {
  items: SearchItem[];
  placeholder: string;
  emptyLabel: string;
  cityLabel?: string;
}) {
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(term) ||
        it.city.toLowerCase().includes(term) ||
        it.cuisine.toLowerCase().includes(term),
    );
  }, [q, items]);

  return (
    <div className="space-y-4">
      <div className="rq-card flex items-center gap-2 p-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[color:var(--muted)]">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
          <path d="M20 20l-3.4-3.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[15px] font-medium text-[color:var(--ink)] outline-none placeholder:text-[color:var(--muted)]"
        />
        {q && (
          <button onClick={() => setQ("")} className="shrink-0 text-[color:var(--muted)]" aria-label="clear">✕</button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="rq-card p-10 text-center text-[color:var(--muted)]">
          <span className="text-3xl">🔍</span>
          <p className="mt-3 text-sm">{emptyLabel}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {results.map((r) => {
            const initial = (r.name || "م").trim().charAt(0);
            return (
              <Link key={r.slug} href={`/r/${r.slug}`} className="rq-card flex items-center gap-3 p-3 transition active:scale-[0.985]">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-800 font-serif text-xl font-bold text-cream-100">
                  {r.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.logo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initial
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[16px] font-bold text-[color:var(--ink)]">{r.name}</p>
                  <p className="mt-0.5 truncate text-[13px] font-medium text-[color:var(--muted)]">
                    {r.cuisine}{r.city ? ` · ${r.city}` : ""}
                  </p>
                </div>
                <span className="text-[color:var(--muted)]">←</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
