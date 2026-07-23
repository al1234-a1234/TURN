import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BrandLink } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { LangToggle } from "@/components/lang-toggle";
import { OwnerNavSidebar, OwnerNavTabs, type NavItem } from "./owner-nav";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";
import {
  isModuleOn,
  staffHasPermission,
  type ModuleKey,
  type StaffPermission,
  type StaffPermissionMap,
} from "@/lib/features";
import type { Database } from "@/lib/supabase/database.types";

export type OwnerNavKey =
  | "overview"
  | "reception"
  | "reservations"
  | "offers"
  | "loyalty"
  | "customers"
  | "reviews"
  | "staff"
  | "tables"
  | "content"
  | "reports"
  | "manage";

type NavDef = {
  key: OwnerNavKey;
  ar: string;
  en: string;
  href: string;
  icon: string;
  module?: ModuleKey;
  perm?: StaffPermission;
  needsReservations?: boolean;
};

const NAV: NavDef[] = [
  { key: "overview", ar: "لوحة التحكم", en: "Dashboard", href: "/dashboard", icon: "📊" },
  { key: "reception", ar: "الاستقبال", en: "Reception", href: "/dashboard/reception", icon: "🪑" },
  { key: "reservations", ar: "الحجوزات", en: "Reservations", href: "/dashboard/reservations", icon: "📅", perm: "reservations", needsReservations: true },
  { key: "offers", ar: "العروض", en: "Offers", href: "/dashboard/offers", icon: "🎁", module: "offers", perm: "offers" },
  { key: "loyalty", ar: "الولاء", en: "Loyalty", href: "/dashboard/loyalty", icon: "⭐", module: "loyalty", perm: "loyalty" },
  { key: "customers", ar: "العملاء", en: "Customers", href: "/dashboard/customers", icon: "👥", module: "crm", perm: "customers" },
  { key: "reviews", ar: "التقييمات", en: "Reviews", href: "/dashboard/reviews", icon: "🌟", module: "reviews", perm: "reviews" },
  { key: "staff", ar: "الموظفون والصلاحيات", en: "Staff & Permissions", href: "/dashboard/staff", icon: "🔐", perm: "team" },
  { key: "tables", ar: "الطاولات", en: "Tables", href: "/dashboard/tables", icon: "🍽️", perm: "settings" },
  { key: "content", ar: "المحتوى والروابط", en: "Content & Links", href: "/dashboard/content", icon: "🔗", perm: "settings" },
  { key: "reports", ar: "التقارير", en: "Reports", href: "/dashboard/reports", icon: "📈", perm: "analytics" },
  { key: "manage", ar: "الإدارة والتحليلات", en: "Management & Analytics", href: "/dashboard/manage", icon: "⚙️", perm: "settings" },
];

export async function OwnerShell({
  restaurant,
  modules,
  role,
  permissions,
  counts,
  children,
}: {
  restaurant: { id: string; name: string; slug: string };
  modules: Set<ModuleKey>;
  role: Database["public"]["Enums"]["user_role"];
  permissions: StaffPermissionMap;
  counts?: Partial<Record<OwnerNavKey, number>>;
  children: React.ReactNode;
}) {
  const lang = await getLang();

  // هل المطعم يستقبل حجوزات؟ (يخفي تبويب الحجوزات إن أُوقف)
  const supabase = await createClient();
  const { data: b } = await supabase
    .from("branches")
    .select("branch_settings(accepts_reservations)")
    .eq("restaurant_id", restaurant.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const bs = Array.isArray(b?.branch_settings) ? b?.branch_settings[0] : b?.branch_settings;
  const acceptsReservations = bs?.accepts_reservations ?? false;

  const items: NavItem[] = NAV.filter((n) => {
    if (n.needsReservations && !acceptsReservations) return false;
    if (n.module && !isModuleOn(modules, n.module)) return false;
    if (n.perm && !staffHasPermission(role, permissions, n.perm)) return false;
    return true;
  }).map((n) => ({ key: n.key, label: tr(lang, n.ar, n.en), href: n.href, icon: n.icon }));

  const countsRec = (counts ?? {}) as Record<string, number>;

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* ===== قائمة جانبية ثابتة (ديسكتوب/تابلت) ===== */}
      <aside className="hidden w-64 shrink-0 flex-col border-e bg-white lg:flex" style={{ borderColor: "var(--border)" }}>
        <div className="border-b p-5" style={{ borderColor: "var(--border)" }}>
          <BrandLink href="/dashboard" size={34} />
          <p className="mt-3 truncate font-display text-lg font-bold text-[color:var(--ink)]">{restaurant.name}</p>
          <p className="text-xs text-[color:var(--muted)]">{tr(lang, "لوحة المالك", "Owner dashboard")}</p>
        </div>
        <OwnerNavSidebar items={items} counts={countsRec} />
        <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
          <div className="mb-2 flex justify-center"><LangToggle variant="plain" /></div>
          <Link href={`/r/${restaurant.slug}`} className="mb-2 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-bold text-[color:var(--muted)] transition hover:text-brand-700">
            <span>🌐</span> {tr(lang, "الصفحة العامة", "Public page")}
          </Link>
          <LogoutButton />
        </div>
      </aside>

      {/* ===== المحتوى ===== */}
      <div className="flex flex-1 flex-col">
        {/* هيدر + تبويبات أفقية (جوال فقط) */}
        <header className="app-header px-5 pb-12 pt-5 lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <BrandLink href="/dashboard" size={38} />
            <div className="flex items-center gap-2">
              <LangToggle />
              <Link href={`/r/${restaurant.slug}`} className="icon-btn" title={tr(lang, "الصفحة العامة", "Public page")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <LogoutButton />
            </div>
          </div>
          <div className="mx-auto mt-6 max-w-3xl">
            <p className="text-xs font-bold tracking-[0.3em] text-cream-200/85">{tr(lang, "لوحة المطعم", "Restaurant dashboard")}</p>
            <h1 className="mt-1 font-display text-3xl font-bold">{restaurant.name}</h1>
          </div>
        </header>

        <div className="px-5 lg:hidden">
          <div className="mx-auto -mt-8 max-w-3xl">
            <OwnerNavTabs items={items} />
          </div>
        </div>

        <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-16 pt-6 lg:pt-8">{children}</main>
      </div>
    </div>
  );
}
