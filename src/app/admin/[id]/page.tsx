import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getModuleCatalog } from "@/lib/features";
import { ModuleToggles, type ModuleRow } from "./module-toggles";
import { addBranchAdmin } from "./actions";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

export default async function RestaurantFeaturesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lang = await getLang();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/partners?redirect=/admin/${id}`);

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  const [{ data: restaurant }, catalog, { data: overrides }, { data: branches }] = await Promise.all([
    supabase.from("restaurants").select("id, name, slug").eq("id", id).maybeSingle(),
    getModuleCatalog(supabase),
    supabase.from("restaurant_features").select("module_key, enabled").eq("restaurant_id", id),
    // ترتيبٌ يضع الفروع النشِطة أوّلًا — الأدمن يفتح فرعًا جديدًا وهو يرى ما
    // هو قائمٌ فعلًا، لا قائمةً معكوسة يفوته آخرها أنّه هو الوحيد الحيّ.
    supabase.from("branches").select("id, name, city, address, is_active, created_at")
      .eq("restaurant_id", id).order("is_active", { ascending: false }).order("created_at"),
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
          <span className="text-lg font-extrabold">{tr(lang, "الباقة", "Plan")}</span>
          <div className="h-11 w-11" />
        </div>
        <div className="mx-auto mt-6 max-w-3xl">
          <p className="text-xs font-bold text-cream-200/85">{tr(lang, "موديولات المطعم", "Restaurant modules")}</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{restaurant.name}</h1>
        </div>
      </header>

      <main className="mx-auto -mt-6 w-full max-w-3xl flex-1 space-y-6 px-5 pb-12">
        <div className="soft-card flex items-center justify-between p-4">
          <div>
            <p className="font-bold text-[color:var(--ink)]">{tr(lang, "الموديولات المُفعّلة", "Enabled modules")}</p>
            <p className="text-xs text-[color:var(--muted)]">{tr(lang, "المالك يشوف فقط ما تفعّله هنا", "The owner only sees what you enable here")}</p>
          </div>
          <span className="font-display text-2xl font-bold text-brand-700">{activeCount}/{modules.length}</span>
        </div>

        <ModuleToggles restaurantId={restaurant.id} modules={modules} />

        {/* الفروع — فتحُ فرعٍ جديد صار هنا حصرًا (انظر actions.ts).
            القائمة أوّلًا كي يرى الأدمن ما هو قائمٌ فعلًا قبل أن يضيف. */}
        <section className="soft-card p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--ink)]">
            {tr(lang, "الفروع", "Branches")}
          </h2>
          <ul className="mb-4 space-y-2">
            {(branches ?? []).map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-2xl border p-3"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-[color:var(--ink)]">{b.name}</p>
                  <p className="truncate text-xs text-[color:var(--muted)]">
                    {[b.city, b.address].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold"
                  style={
                    b.is_active
                      ? { background: "rgba(63,125,93,0.12)", color: "var(--st-open)" }
                      : { background: "rgba(156,59,38,0.10)", color: "var(--danger)" }
                  }
                >
                  {b.is_active ? tr(lang, "نشِط", "Active") : tr(lang, "معطَّل", "Disabled")}
                </span>
              </li>
            ))}
          </ul>
          <form
            action={addBranchAdmin.bind(null, restaurant.id)}
            className="space-y-3 rounded-2xl border p-4"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <input name="name" required placeholder={tr(lang, "اسم الفرع", "Branch name")} className="field-input" />
              <input name="city" placeholder={tr(lang, "المدينة", "City")} className="field-input" />
              <input name="address" placeholder={tr(lang, "العنوان", "Address")} className="field-input" />
            </div>
            <button className="btn btn-secondary w-full">{tr(lang, "+ إضافة فرع", "+ Add branch")}</button>
          </form>
        </section>
      </main>
    </div>
  );
}
