import { redirect } from "next/navigation";
import { loadOwner } from "../owner-context";
import { resolveBranchScope } from "../branch-scope";
import { BranchPicker } from "../branch-picker";
import { staffHasPermission } from "@/lib/features";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";
import { toAr } from "@/lib/format";
import { addTable, deleteTable } from "./actions";
import type { Database } from "@/lib/supabase/database.types";

type Table = Database["public"]["Tables"]["tables"]["Row"];

export default async function TablesPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, role, permissions } = load.ctx;
  if (!staffHasPermission(role, permissions, "settings")) redirect("/dashboard");

  // الطاولات تخصّ فرعًا بعينه — نعرض فرعًا واحدًا لا خليطًا من كل الفروع
  const scope = await resolveBranchScope(load.ctx, (await searchParams).branch);

  const { data } = scope.active
    ? await supabase.from("tables").select("*").eq("branch_id", scope.active.id).eq("is_active", true).order("zone").order("label")
    : { data: [] };
  const list = (data ?? []) as Table[];
  const inside = list.filter((t) => t.zone === "inside");
  const outsideTables = list.filter((t) => t.zone === "outside");
  const totalSeats = list.reduce((a, t) => a + (t.seats ?? 0), 0);

  const field = "field-input";

  const Zone = ({ title, rows, tone }: { title: string; rows: Table[]; tone: string }) => (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-[color:var(--ink)]">
          <span className="h-4 w-1.5 rounded-full" style={{ background: tone }} />
          {title}
        </h3>
        <span className="rounded-full px-2.5 py-0.5 text-sm font-extrabold" style={{ background: "var(--surface-2)", color: tone }}>{toAr(rows.length)}</span>
      </div>
      {rows.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rows.map((t) => (
            <li key={t.id} className="soft-card flex items-center justify-between p-3">
              <div className="min-w-0">
                <p className="truncate font-bold text-[color:var(--ink)]">{t.label}</p>
                <p className="text-xs text-[color:var(--muted)]">{toAr(t.seats)} {tr(lang, "مقاعد", "seats")}</p>
              </div>
              <form action={deleteTable}>
                <input type="hidden" name="table_id" value={t.id} />
                <button className="text-xs font-bold text-[color:var(--muted)] transition hover:text-red-600">{tr(lang, "حذف", "Delete")}</button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <div className="soft-card py-6 text-center text-sm text-[color:var(--muted)]">{tr(lang, "لا توجد طاولات بعد", "No tables yet")}</div>
      )}
    </div>
  );

  return (
    <>
      <div className="mb-5 hidden lg:block">
        <h1 className="font-display text-3xl font-bold text-[color:var(--ink)]">{tr(lang, "الطاولات", "Tables")}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "عرّف طاولاتك الداخلية والخارجية وسعاتها", "Define your indoor & outdoor tables and their seats")}</p>
      </div>

      {scope.multi && scope.active && <BranchPicker branches={scope.branches} activeId={scope.active.id} />}

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Kpi label={tr(lang, "إجمالي الطاولات", "Total tables")} value={toAr(list.length)} tone="var(--brand-d)" />
        <Kpi label={tr(lang, "إجمالي المقاعد", "Total seats")} value={toAr(totalSeats)} tone="var(--st-open)" />
        <Kpi label={tr(lang, "داخلي / خارجي", "Indoor / Outdoor")} value={`${toAr(inside.length)}/${toAr(outsideTables.length)}`} tone="var(--st-full)" />
      </div>

      <section className="soft-card mb-6 p-5">
        <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "طاولة جديدة", "New table")}</h2>
        <p className="mb-4 text-xs font-bold text-[color:var(--muted)]">
          {scope.active
            ? tr(lang, `تُضاف إلى فرع: ${scope.active.name}`, `Added to branch: ${scope.active.name}`)
            : tr(lang, "لا يوجد فرع نشِط", "No active branch")}
        </p>
        <form action={addTable} className="grid gap-3 sm:grid-cols-4">
          {scope.active && <input type="hidden" name="branch_id" value={scope.active.id} />}
          <input name="label" required placeholder={tr(lang, "الاسم/الرقم", "Label/No.")} className={field} />
          <input name="seats" inputMode="numeric" defaultValue="4" placeholder={tr(lang, "المقاعد", "Seats")} className={field} />
          <select name="zone" className={field} defaultValue="inside">
            <option value="inside">{tr(lang, "داخلي", "Indoor")}</option>
            <option value="outside">{tr(lang, "خارجي", "Outdoor")}</option>
          </select>
          <button className="btn btn-primary">{tr(lang, "إضافة", "Add")}</button>
        </form>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Zone title={tr(lang, "طاولات داخلية", "Indoor tables")} rows={inside} tone="var(--st-full)" />
        <Zone title={tr(lang, "طاولات خارجية", "Outdoor tables")} rows={outsideTables} tone="var(--brand)" />
      </div>
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="soft-card p-4 text-center">
      <p className="font-display text-2xl font-bold leading-none" style={{ color: tone }}>{value}</p>
      <p className="mt-1.5 text-[11px] font-bold text-[color:var(--muted)]">{label}</p>
    </div>
  );
}
