import { createClient } from "@/lib/supabase/server";
import { CustomerShell } from "@/components/customer-shell";
import { SearchList, type SearchItem } from "./search-list";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const CUISINE: Record<string, string> = { eficto: "إيطالي", "bait-almounah": "شعبي", noo: "بحري", rudy: "بيتزا", "prime-cut": "برجر", takya: "سعودي معاصر", "najd-village": "نجدي" };
const CUISINE_EN: Record<string, string> = { eficto: "Italian", "bait-almounah": "Local", noo: "Seafood", rudy: "Pizza", "prime-cut": "Burgers", takya: "Modern Saudi", "najd-village": "Najdi" };

export default async function SearchPage() {
  const lang = await getLang();
  const supabase = await createClient();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, slug, logo_url, branches(id, city, is_active)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const items: SearchItem[] = (restaurants ?? []).flatMap((r) => {
    const branch = (r.branches ?? []).find((b) => b.is_active);
    if (!branch) return [];
    return [{
      slug: r.slug,
      name: r.name ?? "",
      logo: r.logo_url,
      city: branch.city ?? "",
      cuisine: tr(lang, CUISINE[r.slug] ?? "مطعم", CUISINE_EN[r.slug] ?? "Restaurant"),
    }];
  });

  return (
    <CustomerShell title={tr(lang, "بحث", "Search")} active="restaurants" search={false}>
      <SearchList
        items={items}
        placeholder={tr(lang, "ابحث باسم المطعم أو المدينة…", "Search by restaurant or city…")}
        emptyLabel={tr(lang, "لا نتائج مطابقة.", "No matching results.")}
        cityLabel={tr(lang, "المدينة", "City")}
      />
    </CustomerShell>
  );
}
