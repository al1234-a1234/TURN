import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CustomerShell } from "@/components/customer-shell";

export const dynamic = "force-dynamic";

const AR = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toAr = (s: string | number) => String(s).replace(/[0-9]/g, (d) => AR[+d]);

const RATING: Record<string, string> = {
  eficto: "٤٫٩",
  "bait-almounah": "٤٫٧",
  noo: "٤٫٦",
  rudy: "٤٫٨",
};
const CUISINE: Record<string, string> = {
  eficto: "إيطالي",
  "bait-almounah": "شعبي",
  noo: "بحري",
  rudy: "بيتزا",
};

export default async function Home() {
  const supabase = await createClient();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, slug, logo_url, cover_url, branches(id, city)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const list = (restaurants ?? []).filter((r) => (r.branches ?? []).length > 0);

  return (
    <CustomerShell title="قائمة الانتظار" active="restaurants">
      {list.length === 0 ? (
        <div className="rq-card p-10 text-center text-[color:var(--muted)]">
          <span className="text-4xl">🍽️</span>
          <p className="mt-3 text-sm">لا توجد مطاعم متاحة بعد.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((r, i) => {
            const initial = r.name.trim().charAt(0) || "م";
            const branches = (r.branches ?? []).length;
            return (
              <Link
                key={r.id}
                href={`/r/${r.slug}`}
                className="reveal rq-card flex items-center gap-4 p-4 transition active:scale-[0.985]"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* الشعار (يمين) */}
                <span className="flex h-[104px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-brand-800 font-serif text-3xl font-bold text-cream-100">
                  {r.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.logo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initial
                  )}
                </span>

                {/* الاسم + المطبخ */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xl font-bold text-[color:var(--ink)]">{r.name}</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-[color:var(--muted)]">
                    {CUISINE[r.slug] ?? "مطعم"}
                  </p>
                </div>

                {/* الفروع + التقييم (يسار) */}
                <div className="flex shrink-0 flex-col items-end justify-between self-stretch py-1 text-left">
                  <span className="text-[13px] font-bold text-[color:var(--muted)]">{toAr(branches)} فرع</span>
                  <span className="flex items-center gap-1 text-[15px] font-extrabold text-[color:var(--ink)]">
                    <span style={{ color: "var(--star)" }}>★</span>
                    {RATING[r.slug] ?? "٤٫٧"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </CustomerShell>
  );
}
