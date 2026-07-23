"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/lang-provider";
import { tr } from "@/lib/i18n";

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
  const lang = useLang();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchItem[]>(items);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (timer.current) clearTimeout(timer.current);
    if (!term) {
      setResults(items);
      setLoading(false);
      return;
    }
    setLoading(true);
    // بحث خادمي مع مهلة ارتداد — لا نحمّل كل المطاعم في المتصفّح
    timer.current = setTimeout(async () => {
      const supabase = createClient();
      const like = `%${term}%`;
      const { data } = await supabase
        .from("restaurants")
        .select("id, name, slug, logo_url, cuisine, cuisine_en, branches(city, is_active)")
        .eq("is_active", true)
        .or(`name.ilike.${like},cuisine.ilike.${like},cuisine_en.ilike.${like}`)
        .limit(30);
      const mapped: SearchItem[] = (data ?? []).flatMap((r) => {
        const branch = (r.branches ?? []).find((b) => b.is_active);
        if (!branch) return [];
        return [{
          slug: r.slug,
          name: r.name ?? "",
          logo: r.logo_url,
          city: branch.city ?? "",
          cuisine: tr(lang, r.cuisine ?? "مطعم", r.cuisine_en ?? "Restaurant"),
        }];
      });
      setResults(mapped);
      setLoading(false);
    }, 260);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, items, lang]);

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

      {loading ? (
        <div className="rq-card p-10 text-center text-sm text-[color:var(--muted)]">…</div>
      ) : results.length === 0 ? (
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
