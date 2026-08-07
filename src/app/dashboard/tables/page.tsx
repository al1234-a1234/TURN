import { redirect } from "next/navigation";
import { loadOwner } from "../owner-context";
import { resolveBranchScope } from "../branch-scope";
import { BranchPicker } from "../branch-picker";
import { staffHasPermission } from "@/lib/features";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";
import { toAr } from "@/lib/format";
import { addTable, deleteTable } from "./actions";
import { ZoneManager, type ZoneRow } from "./zone-manager";
import { zoneLabel } from "@/lib/zones";
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

  const [{ data }, { data: zoneRows }] = scope.active
    ? await Promise.all([
        supabase.from("tables").select("*").eq("branch_id", scope.active.id).eq("is_active", true).order("zone").order("label"),
        supabase.from("branch_zones").select("id, key, name, name_en, sort_order, is_active")
          .eq("branch_id", scope.active.id).order("sort_order"),
      ])
    : [{ data: [] }, { data: [] }];
  const list = (data ?? []) as Table[];
  const zones = (zoneRows ?? []) as ZoneRow[];
  const totalSeats = list.reduce((a, t) => a + (t.seats ?? 0), 0);

  // عدد الطاولات لكل قسم — الإطفاء قرارٌ يحتاج أن يعرف ما يسحبه
  const tableCounts: Record<string, number> = {};
  for (const t of list) tableCounts[t.zone ?? ""] = (tableCounts[t.zone ?? ""] ?? 0) + 1;

  // قسمٌ مُطفأ فيه طاولاتٌ يبقى معروضًا للمالك: إخفاؤه يبدو حذفًا لها وهي باقية.
  const shownZones = zones.filter((z) => z.is_active || (tableCounts[z.key] ?? 0) > 0);
  // طاولاتٌ بمفتاحٍ لا قسمَ له (بياناتٌ قديمة) لا تختفي من الشاشة بصمت
  const orphan = list.filter((t) => !zones.some((z) => z.key === t.zone));
  const activeZones = zones.filter((z) => z.is_active);

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
                <button className="text-xs font-bold text-[color:var(--muted)] transition hover:text-[color:var(--danger)]">{tr(lang, "حذف", "Delete")}</button>
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
        <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "عرّف أقسام مطعمك وطاولاتها وسعاتها", "Define your restaurant's areas, tables and seats")}</p>
      </div>

      {scope.multi && scope.active && <BranchPicker branches={scope.branches} activeId={scope.active.id} />}

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Kpi label={tr(lang, "إجمالي الطاولات", "Total tables")} value={toAr(list.length)} tone="var(--brand-d)" />
        <Kpi label={tr(lang, "إجمالي المقاعد", "Total seats")} value={toAr(totalSeats)} tone="var(--st-open)" />
        <Kpi label={tr(lang, "الأقسام", "Areas")} value={toAr(zones.filter((z) => z.is_active).length)} tone="var(--st-full)" />
      </div>

      {scope.active && (
        <ZoneManager zones={zones} branchId={scope.active.id} lang={lang} tableCounts={tableCounts} />
      )}

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
          {/* الأقسام الفعّالة وحدها: لا تُضاف طاولةٌ إلى قسمٍ مُطفأ */}
          {activeZones.length > 1 ? (
            <select name="zone" className={field} defaultValue={activeZones[0].key}>
              {activeZones.map((z) => (
                <option key={z.key} value={z.key}>{zoneLabel({ key: z.key, name: z.name, nameEn: z.name_en }, lang)}</option>
              ))}
            </select>
          ) : (
            <input type="hidden" name="zone" value={activeZones[0]?.key ?? ""} />
          )}
          <button className="btn btn-primary">{tr(lang, "إضافة", "Add")}</button>
        </form>
      </section>

      <div className={shownZones.length > 1 ? "grid gap-6 sm:grid-cols-2" : "grid gap-6"}>
        {shownZones.map((z, i) => (
          <Zone
            key={z.id}
            title={zoneLabel({ key: z.key, name: z.name, nameEn: z.name_en }, lang)}
            rows={list.filter((t) => t.zone === z.key)}
            tone={ZONE_TONES[i % ZONE_TONES.length]}
          />
        ))}
        {orphan.length > 0 && (
          <Zone title={tr(lang, "بلا قسم", "No area")} rows={orphan} tone="var(--muted)" />
        )}
      </div>
    </>
  );
}

/** الأقسام صارت مفتوحة العدد، فاللون يدور بدل أن يُثبَّت لاثنين. */
const ZONE_TONES = ["var(--st-full)", "var(--brand)", "var(--st-open)", "var(--brand-d)"];

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="soft-card p-4 text-center">
      <p className="font-display text-2xl font-bold leading-none" style={{ color: tone }}>{value}</p>
      <p className="mt-1.5 text-[11px] font-bold text-[color:var(--muted)]">{label}</p>
    </div>
  );
}
