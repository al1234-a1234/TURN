import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BrandLink } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { LangToggle } from "@/components/lang-toggle";
import { OwnerNavSidebar, type NavItem } from "./owner-nav";
import { OwnerHeader } from "./owner-header";
import { exitAdminView } from "../admin/actions";
import { getLang } from "@/lib/i18n-server";
import { tr, type Lang } from "@/lib/i18n";
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
  | "insights"
  | "reception"
  | "reservations"
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
  { key: "insights", ar: "رؤى وتنبيهات", en: "Insights & alerts", href: "/dashboard/insights", icon: "💡" },
  { key: "reception", ar: "الاستقبال", en: "Reception", href: "/dashboard/reception", icon: "🪑", perm: "waitlist" },
  { key: "reservations", ar: "الحجوزات", en: "Reservations", href: "/dashboard/reservations", icon: "📅", perm: "reservations", needsReservations: true },
  { key: "customers", ar: "العملاء", en: "Customers", href: "/dashboard/customers", icon: "👥", module: "crm", perm: "customers" },
  { key: "reviews", ar: "التقييمات", en: "Reviews", href: "/dashboard/reviews", icon: "🌟", module: "reviews", perm: "reviews" },
  { key: "staff", ar: "الموظفون والصلاحيات", en: "Staff & Permissions", href: "/dashboard/staff", icon: "🔐", perm: "team" },
  { key: "tables", ar: "الطاولات", en: "Tables", href: "/dashboard/tables", icon: "🍽️", perm: "settings" },
  { key: "content", ar: "المحتوى والروابط", en: "Content & Links", href: "/dashboard/content", icon: "🔗", perm: "settings" },
  { key: "reports", ar: "التقارير", en: "Reports", href: "/dashboard/reports", icon: "📈", module: "analytics", perm: "analytics" },
  { key: "manage", ar: "الإدارة والتحليلات", en: "Management & Analytics", href: "/dashboard/manage", icon: "⚙️", perm: "settings" },
];

/**
 * اسم الفرع في الترويسة.
 *
 * كان يُسبَق بـ«فرع» دائمًا، والمالك يسمّي فرعه «الفرع الرئيسي» — فيقرأ
 * الموظّف «فرع الفرع الرئيسي». نُسبق فقط حين لا تحمل التسمية الكلمة أصلًا.
 */
function branchLabel(name: string, lang: Lang): string {
  return /فرع|branch/i.test(name) ? name : tr(lang, `فرع ${name}`, `${name} branch`);
}

export async function OwnerShell({
  restaurant,
  branchId = null,
  branchName = null,
  modules,
  role,
  permissions,
  counts,
  adminView = false,
  children,
}: {
  restaurant: { id: string; name: string; slug: string };
  branchId?: string | null;
  branchName?: string | null;
  modules: Set<ModuleKey>;
  role: Database["public"]["Enums"]["user_role"];
  permissions: StaffPermissionMap;
  counts?: Partial<Record<OwnerNavKey, number>>;
  adminView?: boolean;
  children: React.ReactNode;
}) {
  const lang = await getLang();

  // هل يستقبل حجوزات؟ (يخفي تبويب الحجوزات إن أُوقف). للمربوط بفرع: فرعه.
  // لغير المربوط: يكفي فرع واحد مفعّل — قراءة الفرع الأقدم وحده كانت تُخفي
  // التبويب عن مالكٍ فرعُه الثاني يستقبل حجوزات فعلًا.
  const supabase = await createClient();
  let bq = supabase
    .from("branches")
    .select("id, branch_settings(accepts_reservations)")
    .eq("restaurant_id", restaurant.id);
  if (branchId) bq = bq.eq("id", branchId);
  const { data: bRows } = await bq;
  const acceptsReservations = (bRows ?? []).some((b) => {
    const bs = Array.isArray(b.branch_settings) ? b.branch_settings[0] : b.branch_settings;
    return bs?.accepts_reservations ?? false;
  });

  const items: NavItem[] = NAV.filter((n) => {
    if (n.needsReservations && !acceptsReservations) return false;
    if (n.module && !isModuleOn(modules, n.module)) return false;
    if (n.perm && !staffHasPermission(role, permissions, n.perm)) return false;
    return true;
  }).map((n) => ({ key: n.key, label: tr(lang, n.ar, n.en), href: n.href, icon: n.icon }));

  const countsRec = (counts ?? {}) as Record<string, number>;

  return (
   <div className="flex flex-1 flex-col">
    {adminView && (
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-cream-100" style={{ background: "var(--brand-solid)" }}>
        <span className="flex items-center gap-2 text-xs font-bold sm:text-sm">
          <span>🛡️</span>
          {tr(lang, `وضع المشرف — تعرض «${restaurant.name}» بكل فروعه (حسابات الفروع ترى فرعها فقط)`, `Admin view — showing “${restaurant.name}” with all branches (branch accounts see only theirs)`)}
        </span>
        <div className="flex items-center gap-2">
          <Link href="/admin" className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/25 transition hover:bg-white/25">
            {tr(lang, "كل المطاعم", "All restaurants")}
          </Link>
          <form action={exitAdminView}>
            <button type="submit" className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/25 transition hover:bg-white/25">
              {tr(lang, "خروج", "Exit")}
            </button>
          </form>
        </div>
      </div>
    )}
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* ===== قائمة جانبية ثابتة (ديسكتوب/تابلت) ===== */}
      <aside className="hidden w-64 shrink-0 flex-col border-e bg-[color:var(--surface)] lg:flex" style={{ borderColor: "var(--border)" }}>
        <div className="border-b p-5" style={{ borderColor: "var(--border)" }}>
          <BrandLink href="/dashboard" size={34} />
          <p className="mt-3 truncate font-display text-lg font-bold text-[color:var(--ink)]">{restaurant.name}</p>
          {branchName ? (
            <p className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-[color:var(--surface-2)] px-2 py-0.5 text-[11px] font-extrabold text-brand-700">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--brand-d)" }} />
              {tr(lang, `فرع ${branchName}`, `${branchName} branch`)}
            </p>
          ) : (
            <p className="text-xs text-[color:var(--muted)]">{tr(lang, "لوحة المالك", "Owner dashboard")}</p>
          )}
        </div>
        <OwnerNavSidebar items={items} counts={countsRec} />
        <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
          <div className="mb-2 flex justify-center"><LangToggle variant="plain" /></div>
          <Link href={`/r/${restaurant.slug}`} className="mb-2 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-bold text-[color:var(--muted)] transition hover:text-brand-700">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" stroke="currentColor" strokeWidth="2" /></svg> {tr(lang, "الصفحة العامة", "Public page")}
          </Link>
          <Link href="/account" className="mb-2 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-bold text-[color:var(--muted)] transition hover:text-brand-700">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="8" cy="12" r="4" stroke="currentColor" strokeWidth="2" /><path d="M12 12h9M18 12v3M21 12v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> {tr(lang, "حسابي — تغيير كلمة المرور", "My account — change password")}
          </Link>
          <LogoutButton />
        </div>
      </aside>

      {/* ===== المحتوى ===== */}
      <div className="flex flex-1 flex-col">
        {/* ترويسة الجوال: كريميّة بهويّتنا، والتنقّل خلف الشعار (لا شريط
            تبويباتٍ ينزلق أفقيًّا يُخفي نصف وجهاته). */}
        <OwnerHeader
          items={items}
          counts={countsRec}
          restaurantName={restaurant.name}
          restaurantSlug={restaurant.slug}
          branchLabel={branchName ? branchLabel(branchName, lang) : tr(lang, "لوحة المطعم", "Restaurant dashboard")}
        />

        <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-16 pt-6 lg:pt-8">{children}</main>
      </div>
    </div>
   </div>
  );
}
