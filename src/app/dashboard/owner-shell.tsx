import Link from "next/link";
import { BrandLink } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { LangToggle } from "@/components/lang-toggle";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
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
  | "offers"
  | "loyalty"
  | "customers"
  | "reviews"
  | "staff"
  | "manage";

type NavDef = {
  key: OwnerNavKey;
  label: string;
  href: string;
  icon: string;
  module?: ModuleKey;
  perm?: StaffPermission;
};

const NAV: NavDef[] = [
  { key: "overview", label: "لوحة التحكم", href: "/dashboard", icon: "📊" },
  { key: "reception", label: "الاستقبال", href: "/dashboard/reception", icon: "🪑" },
  { key: "offers", label: "العروض", href: "/dashboard/offers", icon: "🎁", module: "offers", perm: "offers" },
  { key: "loyalty", label: "الولاء", href: "/dashboard/loyalty", icon: "⭐", module: "loyalty", perm: "loyalty" },
  { key: "customers", label: "العملاء", href: "/dashboard/customers", icon: "👥", module: "crm", perm: "customers" },
  { key: "reviews", label: "التقييمات", href: "/dashboard/reviews", icon: "🌟", module: "reviews", perm: "reviews" },
  { key: "staff", label: "الموظفون والصلاحيات", href: "/dashboard/staff", icon: "🔐", perm: "team" },
  { key: "manage", label: "الإدارة والتحليلات", href: "/dashboard/manage", icon: "⚙️", perm: "settings" },
];

const NAV_EN: Record<OwnerNavKey, string> = {
  overview: "Dashboard",
  reception: "Reception",
  offers: "Offers",
  loyalty: "Loyalty",
  customers: "Customers",
  reviews: "Reviews",
  staff: "Staff & Permissions",
  manage: "Management & Analytics",
};

export async function OwnerShell({
  active,
  restaurant,
  modules,
  role,
  permissions,
  counts,
  children,
}: {
  active: OwnerNavKey;
  restaurant: { name: string; slug: string };
  modules: Set<ModuleKey>;
  role: Database["public"]["Enums"]["user_role"];
  permissions: StaffPermissionMap;
  counts?: Partial<Record<OwnerNavKey, number>>;
  children: React.ReactNode;
}) {
  const lang = await getLang();
  const items = NAV.filter((n) => {
    if (n.module && !isModuleOn(modules, n.module)) return false;
    if (n.perm && !staffHasPermission(role, permissions, n.perm)) return false;
    return true;
  });

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* ===== قائمة جانبية (ديسكتوب/تابلت) ===== */}
      <aside className="hidden w-64 shrink-0 flex-col border-e bg-white lg:flex" style={{ borderColor: "var(--border)" }}>
        <div className="border-b p-5" style={{ borderColor: "var(--border)" }}>
          <BrandLink href="/dashboard" size={34} />
          <p className="mt-3 truncate font-display text-lg font-bold text-[color:var(--ink)]">{restaurant.name}</p>
          <p className="text-xs text-[color:var(--muted)]">{tr(lang, "لوحة المالك", "Owner Panel")}</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((n) => {
            const on = active === n.key;
            const c = counts?.[n.key];
            return (
              <Link
                key={n.key}
                href={n.href}
                data-active={on}
                className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold transition data-[active=true]:text-white"
                style={on ? { background: "linear-gradient(160deg,#a8371a,#661c0a)" } : { color: "var(--ink)" }}
              >
                <span className="text-base">{n.icon}</span>
                <span className="flex-1">{tr(lang, n.label, NAV_EN[n.key])}</span>
                {c != null && c > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                    style={on ? { background: "rgba(255,255,255,0.25)", color: "#fff" } : { background: "var(--sage)", color: "var(--brand-d)" }}
                  >
                    {toAr(c)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
          <Link href={`/r/${restaurant.slug}`} className="mb-2 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-bold text-[color:var(--muted)] transition hover:text-brand-700">
            <span>🌐</span> {tr(lang, "الصفحة العامة", "Public Page")}
          </Link>
          <div className="mb-2 flex justify-center">
            <LangToggle variant="plain" />
          </div>
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
              <Link href={`/r/${restaurant.slug}`} className="icon-btn" title={tr(lang, "الصفحة العامة", "Public Page")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <LogoutButton />
            </div>
          </div>
          <div className="mx-auto mt-6 max-w-3xl">
            <p className="text-xs font-bold tracking-[0.3em] text-cream-200/85">{tr(lang, "لوحة المطعم", "Restaurant Panel")}</p>
            <h1 className="mt-1 font-display text-3xl font-bold">{restaurant.name}</h1>
          </div>
        </header>

        <div className="px-5 lg:hidden">
          <div className="mx-auto -mt-8 max-w-3xl">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {items.map((n) => (
                <Link
                  key={n.key}
                  href={n.href}
                  data-active={active === n.key}
                  className="shrink-0 rounded-2xl px-4 py-3 text-center text-sm font-bold text-[color:var(--muted)] transition data-[active=true]:text-white"
                  style={active === n.key ? { background: "linear-gradient(160deg,#a8371a,#661c0a)" } : { background: "#fff", border: "1px solid var(--border)" }}
                >
                  {tr(lang, n.label, NAV_EN[n.key])}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-16 pt-6 lg:pt-8">{children}</main>
      </div>
    </div>
  );
}
