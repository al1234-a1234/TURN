import Link from "next/link";
import { BrandLink } from "@/components/brand";
import {
  isModuleOn,
  staffHasPermission,
  type ModuleKey,
  type StaffPermission,
  type StaffPermissionMap,
} from "@/lib/features";
import type { Database } from "@/lib/supabase/database.types";

export function OwnerHeader({
  title,
  slug,
  email,
  actions,
}: {
  title?: string;
  slug?: string;
  email?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="app-header px-5 pb-12 pt-5">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <BrandLink href="/dashboard" size={38} />
        <div className="flex items-center gap-2">
          {slug && (
            <Link href={`/r/${slug}`} className="icon-btn" title="الصفحة العامة">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
          {actions}
        </div>
      </div>
      {title && (
        <div className="mx-auto mt-6 max-w-3xl">
          <p className="text-xs font-bold tracking-[0.3em] text-cream-200/85">لوحة المطعم</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{title}</h1>
        </div>
      )}
      {!title && email && (
        <p className="mx-auto mt-4 max-w-3xl text-sm text-white/80" dir="ltr">{email}</p>
      )}
    </header>
  );
}

export type OwnerTabKey =
  | "reception"
  | "offers"
  | "loyalty"
  | "customers"
  | "reviews"
  | "manage";

type TabDef = {
  key: OwnerTabKey;
  label: string;
  href: string;
  module?: ModuleKey; // يظهر فقط إذا كان الموديول مُفعّلًا
  perm?: StaffPermission; // يظهر فقط إذا كان للموظف الصلاحية (المدير/المالك دائمًا)
};

// ترتيب التبويبات في لوحة المالك. الاستقبال دائمًا؛ البقية حسب الموديول والصلاحية.
const TAB_DEFS: TabDef[] = [
  { key: "reception", label: "الاستقبال", href: "/dashboard" },
  { key: "offers", label: "العروض", href: "/dashboard/offers", module: "offers", perm: "offers" },
  { key: "loyalty", label: "الولاء", href: "/dashboard/loyalty", module: "loyalty", perm: "loyalty" },
  { key: "customers", label: "العملاء", href: "/dashboard/customers", module: "crm", perm: "customers" },
  { key: "reviews", label: "التقييمات", href: "/dashboard/reviews", module: "reviews", perm: "reviews" },
  { key: "manage", label: "الإدارة والتحليلات", href: "/dashboard/manage", perm: "settings" },
];

export function OwnerTabs({
  active,
  modules,
  role,
  permissions,
}: {
  active: OwnerTabKey;
  modules: Set<ModuleKey>;
  role: Database["public"]["Enums"]["user_role"];
  permissions: StaffPermissionMap;
}) {
  const tabs = TAB_DEFS.filter((t) => {
    if (t.module && !isModuleOn(modules, t.module)) return false;
    if (t.perm && !staffHasPermission(role, permissions, t.perm)) return false;
    return true;
  });

  return (
    <div className="mb-5 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          data-active={active === t.key}
          className="shrink-0 rounded-2xl px-4 py-3 text-center text-sm font-bold text-[color:var(--muted)] transition data-[active=true]:text-white"
          style={
            active === t.key
              ? { background: "linear-gradient(160deg,#a8371a,#661c0a)" }
              : { background: "#fff", border: "1px solid var(--border)" }
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
