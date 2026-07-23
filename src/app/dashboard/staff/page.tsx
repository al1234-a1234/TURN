import { redirect } from "next/navigation";
import { loadOwner } from "../owner-context";
import { PermToggle } from "./perm-toggle";
import {
  staffHasPermission,
  STAFF_PERMISSIONS,
  type StaffPermissionMap,
} from "@/lib/features";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import type { Database } from "@/lib/supabase/database.types";

type StaffRow = {
  id: string;
  name: string | null;
  role: Database["public"]["Enums"]["user_role"];
  permissions: StaffPermissionMap | null;
  is_active: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  owner: "المالك",
  manager: "مدير",
  staff: "موظف",
  host: "استقبال",
};

const ROLE_LABEL_EN: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
  host: "Host",
};

// تسمية الصلاحيات محليًا (عربي/إنجليزي) بدل STAFF_PERMISSION_LABELS
const PERM_LABEL_AR: Record<string, string> = {
  waitlist: "إدارة الطابور",
  reservations: "إدارة الحجوزات",
  analytics: "عرض التحليلات",
  offers: "إدارة العروض",
  loyalty: "إدارة الولاء",
  customers: "ملفّات العملاء",
  reviews: "التقييمات",
  settings: "الإعدادات وأوقات العمل",
  menu: "المنيو والأسعار",
  team: "إدارة الفريق",
};

const PERM_LABEL_EN: Record<string, string> = {
  waitlist: "Queue",
  reservations: "Reservations",
  analytics: "Analytics",
  offers: "Offers",
  loyalty: "Loyalty",
  customers: "Customer profiles",
  reviews: "Reviews",
  settings: "Settings & hours",
  menu: "Menu & prices",
  team: "Team",
};

export default async function StaffPage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  // إدارة الفريق للمالك/المدير فقط
  if (!staffHasPermission(role, permissions, "team")) redirect("/dashboard");

  const { data } = await supabase
    .from("staff")
    .select("id, name, role, permissions, is_active")
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .order("role");

  const team = (data ?? []) as StaffRow[];

  return (
    <>
      <div className="mb-5 hidden lg:block">
        <h1 className="font-display text-3xl font-bold text-[color:var(--ink)]">{tr(lang, "الموظفون والصلاحيات", "Staff & permissions")}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "افتح لكل موظف ما تريده بالضبط — تحكّم كامل ومرن", "Grant each staff member exactly what you want — full, flexible control")}</p>
      </div>

      <div className="space-y-4">
        {team.map((m) => {
          const isBoss = m.role === "owner" || m.role === "manager";
          const perms = (m.permissions ?? {}) as StaffPermissionMap;
          return (
            <section key={m.id} className="soft-card p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-bold text-white" style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}>
                  {(m.name ?? tr(lang, "؟", "?")).trim().charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[color:var(--ink)]">{m.name ?? tr(lang, "موظف", "Staff")}</p>
                  <p className="text-xs text-[color:var(--muted)]">{tr(lang, ROLE_LABEL[m.role] ?? m.role, ROLE_LABEL_EN[m.role] ?? m.role)}</p>
                </div>
                {isBoss && (
                  <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: "var(--sage)", color: "var(--brand-d)" }}>
                    {tr(lang, "كل الصلاحيات", "All permissions")}
                  </span>
                )}
              </div>

              {isBoss ? (
                <p className="text-sm text-[color:var(--muted)]">
                  {m.role === "owner" ? tr(lang, "المالك يملك صلاحية كل شيء تلقائيًا.", "The owner automatically has access to everything.") : tr(lang, "المدير يملك كل الصلاحيات تلقائيًا.", "The manager automatically has all permissions.")}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {STAFF_PERMISSIONS.map((p) => (
                    <PermToggle
                      key={p}
                      staffId={m.id}
                      perm={p}
                      label={tr(lang, PERM_LABEL_AR[p] ?? p, PERM_LABEL_EN[p] ?? p)}
                      granted={perms[p] === true}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        <div className="rounded-2xl p-4 text-center text-sm text-[color:var(--muted)]" style={{ background: "var(--surface)", border: "1px dashed var(--border)" }}>
          {tr(lang, "لإضافة موظف جديد تواصل مع إدارة دور — نُنشئ له حساب دخول ثم تتحكّم بصلاحياته من هنا.", "To add a new staff member, contact the Turn team — we'll create a login account, then you control their permissions here.")}
        </div>
      </div>
    </>
  );
}
