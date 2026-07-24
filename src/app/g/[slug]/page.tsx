import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CheckinForm } from "./checkin-form";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function CheckinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lang = await getLang();
  const supabase = await createClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name, name_en, logo_url, cover_url, cuisine, cuisine_en, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!restaurant) notFound();

  const name = tr(lang, restaurant.name, restaurant.name_en ?? restaurant.name);
  const cuisine = tr(lang, restaurant.cuisine ?? "", restaurant.cuisine_en ?? "");
  const initial = (restaurant.name ?? "").trim().charAt(0) || "م";

  return (
    <div className="min-h-full" style={{ background: "var(--background)" }}>
      {/* هيدر المطعم */}
      <header className="rq-header px-6 pb-16 pt-10 text-center">
        <span className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-white/15 font-serif text-4xl font-bold text-cream-100 ring-1 ring-white/25">
          {restaurant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.logo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold text-white">{name}</h1>
        {cuisine && <p className="mt-1 text-sm font-medium text-white/80">{cuisine}</p>}
      </header>

      <main className="mx-auto -mt-10 w-full max-w-md px-5 pb-16">
        <div className="mb-4 text-center">
          <h2 className="font-display text-xl font-bold text-[color:var(--ink)]">{tr(lang, "امسح خذ هديتك 🎁", "Scan & get your gift 🎁")}</h2>
          <p className="mt-1 text-sm font-medium text-[color:var(--muted)]">
            {tr(lang, "اكتب رقمك واستلم هديتك — بدون تطبيق ولا تسجيل", "Enter your number and get your gift — no app, no signup")}
          </p>
        </div>

        <CheckinForm slug={slug} lang={lang} />

        <p className="mt-8 text-center text-[11px] font-bold tracking-widest text-[color:var(--muted)]">
          {tr(lang, "مقدّم من دور", "Powered by Turn")}
        </p>
      </main>
    </div>
  );
}
