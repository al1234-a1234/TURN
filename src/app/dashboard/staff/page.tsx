import { redirect } from "next/navigation";
import { loadOwner } from "../owner-context";
import { PermToggle } from "./perm-toggle";
import { StaffProvision, ResetCode } from "./staff-provision";
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
  branch_id: string | null;
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
  const { supabase, restaurant, role, permissions } = load.ctx;

  // إدارة الفريق للمالك/المدير فقط
  if (!staffHasPermission(role, permissions, "team")) redirect("/dashboard");

  const [{ data: branchRows }, { data }] = await Promise.all([
    supabase.from("branches").select("id, name").eq("restaurant_id", restaurant.id).eq("is_active", true).order("created_at"),
    supabase
      .from("staff")
      .select("id, name, role, permissions, is_active, branch_id")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .order("role"),
  ]);

  const team = (data ?? []) as StaffRow[];
  const branchName = new Map((branchRows ?? []).map((b) => [b.id, b.name]));
  const isBrandLevel = load.ctx.branchId == null;
  // موظّف العلامة (بلا فرع) فوق مدير الفرع — يُعرض ولا يُعدَّل من داخل الفرع
  const canEdit = (m: StaffRow) => isBrandLevel || m.branch_id === load.ctx.branchId;

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
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-bold text-cream-100" style={{ background: "var(--brand-solid)" }}>
                  {(m.name ?? tr(lang, "؟", "?")).trim().charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[color:var(--ink)]">{m.name ?? tr(lang, "موظف", "Staff")}</p>
                  <p className="text-xs text-[color:var(--muted)]">
                    {tr(lang, ROLE_LABEL[m.role] ?? m.role, ROLE_LABEL_EN[m.role] ?? m.role)}
                    {" · "}
                    {m.branch_id
                      ? (branchName.get(m.branch_id) ?? tr(lang, "فرع", "Branch"))
                      : tr(lang, "كل الفروع", "All branches")}
                  </p>
                </div>
                {isBoss && (
                  <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: "var(--sage)", color: "var(--brand-d)" }}>
                    {tr(lang, "كل الصلاحيات", "All permissions")}
                  </span>
                )}
              </div>

              {!canEdit(m) ? (
                <p className="text-sm text-[color:var(--muted)]">
                  {tr(lang, "حساب على مستوى العلامة — يديره مالك العلامة.", "A brand-level account — managed by the brand owner.")}
                </p>
              ) : isBoss ? (
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
              {m.role !== "owner" && canEdit(m) && <ResetCode staffId={m.id} />}
            </section>
          );
        })}

        <StaffProvision restaurantId={restaurant.id} branches={(branchRows ?? []).filter((b) => isBrandLevel || b.id === load.ctx.branchId)} />

        <p className="text-center text-xs text-[color:var(--muted)]">
          {tr(lang, "الموظّف يدخل من صفحة الاستقبال /reception باسم المستخدم والرمز.", "Staff sign in at /reception with their username and code.")}
        </p>
      </div>
    </>
  );
}
