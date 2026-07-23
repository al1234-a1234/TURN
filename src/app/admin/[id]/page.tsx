import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getModuleCatalog } from "@/lib/features";
import { ModuleToggles, type ModuleRow } from "./module-toggles";

export default async function RestaurantFeaturesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/partners?redirect=/admin/${id}`);

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  const [{ data: restaurant }, catalog, { data: overrides }] = await Promise.all([
    supabase.from("restaurants").select("id, name, slug").eq("id", id).maybeSingle(),
    getModuleCatalog(supabase),
    supabase.from("restaurant_features").select("module_key, enabled").eq("restaurant_id", id),
  ]);

  if (!restaurant) redirect("/admin");

  const override = new Map<string, boolean>((overrides ?? []).map((o) => [o.module_key, o.enabled]));

  // الحالة الفعّالة: تجاوز صريح يفوز، وإلا أساسي أو مُفعّل افتراضيًا
  const modules: ModuleRow[] = catalog.map((m) => ({
    key: m.key,
    name_ar: m.name_ar,
    description_ar: m.description_ar,
    category: m.category,
    is_core: m.is_core,
    enabled: m.is_core || (override.has(m.key) ? override.get(m.key)! : m.default_enabled),
  }));

  const activeCount = modules.filter((m) => m.enabled).length;

  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-12 pt-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/admin" className="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <span className="text-lg font-extrabold">الباقة</span>
          <div className="h-11 w-11" />
        </div>
        <div className="mx-auto mt-6 max-w-3xl">
          <p className="text-xs font-bold tracking-[0.3em] text-cream-200/85">موديولات المطعم</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{restaurant.name}</h1>
        </div>
      </header>

      <main className="mx-auto -mt-6 w-full max-w-3xl flex-1 space-y-6 px-5 pb-12">
        <div className="soft-card flex items-center justify-between p-4">
          <div>
            <p className="font-bold text-[color:var(--ink)]">الموديولات المُفعّلة</p>
            <p className="text-xs text-[color:var(--muted)]">المالك يشوف فقط ما تفعّله هنا</p>
          </div>
          <span className="font-display text-2xl font-bold text-brand-700">{activeCount}/{modules.length}</span>
        </div>

        <ModuleToggles restaurantId={restaurant.id} modules={modules} />
      </main>
    </div>
  );
}
