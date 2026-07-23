import Link from "next/link";
import { QueueActions } from "../queue-actions";
import { WalkInForm } from "./walkin-form";
import { loadOwner } from "../owner-context";
import { staffHasPermission } from "@/lib/features";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export default async function ReceptionPage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, restaurant, role, permissions } = load.ctx;
  const canViewCustomers = staffHasPermission(role, permissions, "customers");

  const { data: branches } = await supabase
    .from("branches").select("id, name").eq("restaurant_id", restaurant.id).order("created_at");
  const branchIds = (branches ?? []).map((b) => b.id);

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [{ data: queue }, todayRes] = branchIds.length
    ? await Promise.all([
        supabase
          .from("waitlist_entries")
          .select("id, customer_id, position, party_size, zone, status, joined_at, customers(full_name, phone)")
          .in("branch_id", branchIds)
          .in("status", ["waiting", "notified"])
          .order("position", { nullsFirst: false }),
        supabase.from("waitlist_entries").select("id", { count: "exact", head: true })
          .in("branch_id", branchIds).eq("status", "seated").gte("seated_at", startToday),
      ])
    : [{ data: [] }, { count: 0 }];

  const list = queue ?? [];
  const inside = list.filter((q) => q.zone === "inside");
  const outside = list.filter((q) => q.zone === "outside");
  const other = list.filter((q) => q.zone !== "inside" && q.zone !== "outside");
  const servedToday = todayRes?.count ?? 0;

  type Row = (typeof list)[number];
  const Card = ({ q }: { q: Row }) => {
    const cust = Array.isArray(q.customers) ? q.customers[0] : q.customers;
    const waited = minutesSince(q.joined_at);
    return (
      <li className="soft-card flex items-center gap-3 p-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-xl font-bold text-white" style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}>
          {q.position ? toAr(q.position) : "•"}
        </span>
        <div className="min-w-0 flex-1">
          {canViewCustomers ? (
            <Link href={`/dashboard/customers/${q.customer_id}`} className="truncate font-bold text-brand-700 underline-offset-2 hover:underline">
              {cust?.full_name ?? tr(lang, "عميل", "Customer")}
            </Link>
          ) : (
            <p className="truncate font-bold text-[color:var(--ink)]">{cust?.full_name ?? tr(lang, "عميل", "Customer")}</p>
          )}
          <p className="text-sm text-[color:var(--muted)]" dir="ltr">{cust?.phone ?? "—"}</p>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">
            {toAr(q.party_size)} {tr(lang, "أشخاص", "guests")} · ⏱ {toAr(waited)} {tr(lang, "دقيقة", "min")}{q.status === "notified" ? tr(lang, " · أُشعِر ✓", " · Notified ✓") : ""}
          </p>
        </div>
        <QueueActions id={q.id} name={cust?.full_name ?? tr(lang, "عميلنا", "our guest")} phone={cust?.phone ?? ""} restaurant={restaurant.name} position={q.position} />
      </li>
    );
  };

  const ZoneColumn = ({ title, rows, tone }: { title: string; rows: Row[]; tone: string }) => (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-[color:var(--ink)]">
          <span className="h-4 w-1.5 rounded-full" style={{ background: tone }} />
          {title}
        </h3>
        <span className="rounded-full px-2.5 py-0.5 text-sm font-extrabold" style={{ background: "var(--surface-2)", color: tone }}>{toAr(rows.length)}</span>
      </div>
      {rows.length ? (
        <ul className="space-y-2.5">{rows.map((q) => <Card key={q.id} q={q} />)}</ul>
      ) : (
        <div className="soft-card py-8 text-center text-sm text-[color:var(--muted)]">{tr(lang, "لا أحد بالانتظار", "No one waiting")}</div>
      )}
    </div>
  );

  return (
    <>
      <div className="mb-5 hidden lg:block">
        <h1 className="font-display text-3xl font-bold text-[color:var(--ink)]">{tr(lang, "الاستقبال", "Reception")}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "الطابور الحيّ — إجلاس، تنبيه، وإدارة", "Live queue — seat, notify, and manage")}</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={tr(lang, "في الطابور الآن", "In queue now")} value={toAr(list.length)} tone="var(--brand-d)" />
        <Stat label={tr(lang, "طابور داخلي", "Indoor queue")} value={toAr(inside.length)} tone="var(--st-full)" />
        <Stat label={tr(lang, "طابور خارجي", "Outdoor queue")} value={toAr(outside.length)} tone="var(--st-full)" />
        <Stat label={tr(lang, "خدمناهم اليوم", "Served today")} value={toAr(servedToday)} tone="var(--st-open)" />
      </div>

      <WalkInForm />

      <div className="grid gap-6 sm:grid-cols-2">
        <ZoneColumn title={tr(lang, "طاولات داخلية", "Indoor tables")} rows={inside} tone="var(--st-full)" />
        <ZoneColumn title={tr(lang, "طاولات خارجية", "Outdoor tables")} rows={outside} tone="var(--st-full)" />
      </div>
      {other.length > 0 && (
        <div className="mt-6"><ZoneColumn title={tr(lang, "غير محدّد", "Unspecified")} rows={other} tone="var(--muted)" /></div>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="soft-card p-4 text-center">
      <p className="font-display text-3xl font-bold leading-none" style={{ color: tone }}>{value}</p>
      <p className="mt-1.5 text-xs font-bold text-[color:var(--muted)]">{label}</p>
    </div>
  );
}
