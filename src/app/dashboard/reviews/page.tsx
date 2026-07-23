import { redirect } from "next/navigation";
import { loadOwner } from "../owner-context";
import { isModuleOn, staffHasPermission } from "@/lib/features";
import { ReviewPublishToggle } from "./review-toggle";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import type { Database } from "@/lib/supabase/database.types";

type Review = Database["public"]["Tables"]["reviews"]["Row"] & {
  customers: { full_name: string } | { full_name: string }[] | null;
};

function stars(n: number): string {
  return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
}
function fmtDate(iso: string, lang: "ar" | "en"): string {
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", { day: "numeric", month: "short" });
}

export default async function ReviewsPage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  if (!isModuleOn(modules, "reviews") || !staffHasPermission(role, permissions, "reviews")) {
    redirect("/dashboard");
  }

  const { data } = await supabase
    .from("reviews")
    .select("*, customers(full_name)")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const list = (data ?? []) as Review[];
  const count = list.length;
  const avg = count ? Math.round((list.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10 : 0;
  const routed = list.filter((r) => r.routed_to_google).length;

  // توزيع النجوم 5→1
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: list.filter((r) => r.rating === s).length }));
  const maxN = Math.max(1, ...dist.map((d) => d.n));

  const routingOn = isModuleOn(modules, "review_routing");

  return (
    <div className="space-y-6">
        {/* ملخّص التقييم */}
        <section className="soft-card p-5">
          <div className="flex items-center gap-5">
            <div className="text-center">
              <p className="font-display text-5xl font-bold text-brand-700 leading-none">{toAr(avg)}</p>
              <p className="mt-1 text-lg" style={{ color: "var(--star)" }}>{stars(Math.round(avg))}</p>
              <p className="mt-1 text-xs text-[color:var(--muted)]">{toAr(count)} {tr(lang, "تقييم", "reviews")}</p>
            </div>
            <div className="flex-1 space-y-1.5">
              {dist.map((d) => (
                <div key={d.s} className="flex items-center gap-2">
                  <span className="w-6 text-xs font-bold text-[color:var(--muted)]">{toAr(d.s)}★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(d.n / maxN) * 100}%`, background: "linear-gradient(90deg,#a8371a,#661c0a)" }} />
                  </div>
                  <span className="w-6 text-left text-xs text-[color:var(--muted)]">{toAr(d.n)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* توجيه التقييم الذكي */}
        {routingOn && (
          <div className="rounded-2xl p-4" style={{ background: "var(--sage)", border: "1px solid var(--border)" }}>
            <p className="flex items-center gap-2 text-sm font-bold text-[color:var(--brand-d)]">
              <span>🧭</span> {tr(lang, "توجيه التقييم الذكي مُفعّل", "Smart review routing is on")}
            </p>
            <p className="mt-1 text-xs text-[color:var(--muted)]">
              {tr(lang, "العملاء الراضون (4★ وأعلى) يُوجَّهون لِخرائط Google، والملاحظات الأقل تصلك أنت مباشرةً. وُجِّه ", "Happy customers (4★ and up) are routed to Google Maps, while lower feedback reaches you directly. ")}
              {toAr(routed)} {tr(lang, "تقييم إيجابي حتى الآن.", "positive reviews routed so far.")}
            </p>
          </div>
        )}

        {/* قائمة التقييمات */}
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "كل التقييمات", "All reviews")}</h2>
          {count === 0 ? (
            <div className="soft-card py-10 text-center">
              <p className="text-2xl">⭐</p>
              <p className="mt-2 font-bold text-[color:var(--ink)]">{tr(lang, "لا توجد تقييمات بعد", "No reviews yet")}</p>
              <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "تظهر التقييمات هنا بعد زيارات العملاء.", "Reviews appear here after customer visits.")}</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {list.map((r) => {
                const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
                return (
                  <li key={r.id} className="soft-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base" style={{ color: "var(--star)" }}>{stars(r.rating)}</span>
                          {r.routed_to_google && <span className="text-[10px] font-bold text-[color:var(--st-open)]">↗ Google</span>}
                        </div>
                        <p className="mt-1.5 text-sm text-[color:var(--ink)]">{r.comment ?? "—"}</p>
                        <p className="mt-1.5 text-xs text-[color:var(--muted)]">{c?.full_name ?? tr(lang, "عميل", "Customer")} · {fmtDate(r.created_at, lang)}</p>
                      </div>
                      <ReviewPublishToggle id={r.id} published={r.is_published} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
    </div>
  );
}
