"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CustomerShell } from "@/components/customer-shell";
import { useLang } from "@/components/lang-provider";
import { tr } from "@/lib/i18n";
import { getFavorites, type FavRestaurant } from "@/lib/local-store";

export default function FavoritesPage() {
  const lang = useLang();
  const [favs, setFavs] = useState<FavRestaurant[] | null>(null);

  useEffect(() => {
    const sync = () => setFavs(getFavorites());
    sync();
    window.addEventListener("turn:store", sync);
    return () => window.removeEventListener("turn:store", sync);
  }, []);

  return (
    <CustomerShell active="other" search={false}>
      {favs === null ? null : favs.length === 0 ? (
        <div className="rq-card p-10 text-center text-[color:var(--muted)]">
          <span className="text-4xl">🤍</span>
          <p className="mt-3 text-sm">{tr(lang, "لا توجد مطاعم في مفضّلتك بعد.", "No favorite restaurants yet.")}</p>
          <p className="mt-1 text-xs">{tr(lang, "اضغط «متابعة» في صفحة أي مطعم لإضافته هنا.", "Tap “Follow” on any restaurant page to add it here.")}</p>
          <Link href="/" className="rq-btn-soft mt-4 inline-flex">{tr(lang, "تصفّح المطاعم", "Browse restaurants")}</Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {favs.map((r) => {
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
                <p className="min-w-0 flex-1 truncate font-display text-[16px] font-bold text-[color:var(--ink)]">{r.name}</p>
                <span className="text-[color:var(--brand-d)]">❤️</span>
              </Link>
            );
          })}
        </div>
      )}
    </CustomerShell>
  );
}
