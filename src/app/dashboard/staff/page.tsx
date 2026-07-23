import { redirect } from "next/navigation";
import { OwnerShell } from "../owner-shell";
import { loadOwner } from "../owner-context";
import { PermToggle } from "./perm-toggle";
import {
  staffHasPermission,
  STAFF_PERMISSIONS,
  STAFF_PERMISSION_LABELS,
  type StaffPermissionMap,
} from "@/lib/features";
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

export default async function StaffPage() {
  const load = await loadOwner();
  if (load.state !== "ok") redirect("/dashboard");
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
    <OwnerShell active="staff" restaurant={restaurant} modules={modules} role={role} permissions={permissions} counts={{ staff: team.length }}>
      <div className="mb-5 hidden lg:block">
        <h1 className="font-display text-3xl font-bold text-[color:var(--ink)]">الموظفون والصلاحيات</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">افتح لكل موظف ما تريده بالضبط — تحكّم كامل ومرن</p>
      </div>

      <div className="space-y-4">
        {team.map((m) => {
          const isBoss = m.role === "owner" || m.role === "manager";
          const perms = (m.permissions ?? {}) as StaffPermissionMap;
          return (
            <section key={m.id} className="soft-card p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-bold text-white" style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}>
                  {(m.name ?? "؟").trim().charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[color:var(--ink)]">{m.name ?? "موظف"}</p>
                  <p className="text-xs text-[color:var(--muted)]">{ROLE_LABEL[m.role] ?? m.role}</p>
                </div>
                {isBoss && (
                  <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: "var(--sage)", color: "var(--brand-d)" }}>
                    كل الصلاحيات
                  </span>
                )}
              </div>

              {isBoss ? (
                <p className="text-sm text-[color:var(--muted)]">
                  {m.role === "owner" ? "المالك يملك صلاحية كل شيء تلقائيًا." : "المدير يملك كل الصلاحيات تلقائيًا."}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {STAFF_PERMISSIONS.map((p) => (
                    <PermToggle
                      key={p}
                      staffId={m.id}
                      perm={p}
                      label={STAFF_PERMISSION_LABELS[p]}
                      granted={perms[p] === true}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        <div className="rounded-2xl p-4 text-center text-sm text-[color:var(--muted)]" style={{ background: "var(--surface)", border: "1px dashed var(--border)" }}>
          لإضافة موظف جديد تواصل مع إدارة دور — نُنشئ له حساب دخول ثم تتحكّم بصلاحياته من هنا.
        </div>
      </div>
    </OwnerShell>
  );
}
