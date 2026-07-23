import { createClient } from "@/lib/supabase/server";
import { CustomerShell } from "@/components/customer-shell";
import { SearchList, type SearchItem } from "./search-list";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const lang = await getLang();
  const supabase = await createClient();

  // مجموعة أوّلية محدودة للتصفّح؛ الكتابة تبحث في القاعدة مباشرة (للتوسّع)
  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, slug, logo_url, cuisine, cuisine_en, branches(id, city, is_active)")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(30);

  const items: SearchItem[] = (restaurants ?? []).flatMap((r) => {
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

  return (
    <CustomerShell active="restaurants" search={false}>
      <SearchList
        items={items}
        placeholder={tr(lang, "ابحث باسم المطعم أو المدينة…", "Search by restaurant or city…")}
        emptyLabel={tr(lang, "لا نتائج مطابقة.", "No matching results.")}
        cityLabel={tr(lang, "المدينة", "City")}
      />
    </CustomerShell>
  );
}
