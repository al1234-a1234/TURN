import Link from "next/link";
import { redirect } from "next/navigation";
import { QueueActions } from "../queue-actions";
import { WalkInForm } from "./walkin-form";
import { AutoRefresh } from "./auto-refresh";
import { BranchTabs } from "./branch-tabs";
import { loadOwner, scopeBranchIds } from "../owner-context";
import { staffHasPermission } from "@/lib/features";
import { toAr } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { riyadhDayStart } from "@/lib/dates";

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export default async function ReceptionPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, restaurant, role, permissions } = load.ctx;
  if (!staffHasPermission(role, permissions, "waitlist")) redirect("/dashboard");
  const canViewCustomers = staffHasPermission(role, permissions, "customers");

  const { data: branches } = await supabase
    .from("branches").select("id, name, city").eq("restaurant_id", restaurant.id).eq("is_active", true).order("created_at");
  // عزل الفرانشايز: حساب مربوط بفرع يرى فرعه فقط (بلا تبويبات)؛ غير المربوط يرى الكل
  const scopedIds = new Set(scopeBranchIds(load.ctx, (branches ?? []).map((b) => b.id)));
  const branchList = (branches ?? []).filter((b) => scopedIds.has(b.id));
  const multi = branchList.length > 1;

  // فرع مختار — كل فرع قسم مستقل تمامًا (نمط ريكيو). الاستقبال يعمل على فرع واحد فقط.
  const requested = (await searchParams).branch;
  const activeBranch =
    branchList.find((b) => b.id === requested) ?? branchList[0] ?? null;

  const startToday = riyadhDayStart().toISOString();

  const [{ data: queue }, todayRes] = activeBranch
    ? await Promise.all([
        supabase
          .from("waitlist_entries")
          .select("id, customer_id, position, party_size, zone, status, joined_at, confirmed_at, distance_m, customers(full_name, phone)")
          .eq("branch_id", activeBranch.id)
          .in("status", ["waiting", "notified"])
          .order("position", { nullsFirst: false }),
        supabase.from("waitlist_entries").select("id", { count: "exact", head: true })
          .eq("branch_id", activeBranch.id).eq("status", "seated").gte("seated_at", startToday),
      ])
    : [{ data: [] }, { count: 0 }];

  const list = queue ?? [];
  const inside = list.filter((q) => q.zone === "inside");
  const outside = list.filter((q) => q.zone === "outside");
  const other = list.filter((q) => q.zone !== "inside" && q.zone !== "outside");
  const servedToday = todayRes?.count ?? 0;

  type Row = (typeof list)[number];
  // rank = الترتيب الحيّ داخل القسم (1،2،3…) لا الرقم المخزَّن — ينضغط عند الإجلاس
  const Card = ({ q, rank }: { q: Row; rank: number }) => {
    const cust = Array.isArray(q.customers) ? q.customers[0] : q.customers;
    const waited = minutesSince(q.joined_at);
    return (
      <li className="soft-card flex items-center gap-3 p-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-xl font-bold text-white" style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}>
          {toAr(rank)}
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
          {q.distance_m != null && (
            <span className="mt-1 me-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold"
              style={{ background: "var(--surface-2)", border: "1px solid rgba(102,28,10,0.14)", color: q.distance_m > 5000 ? "#9a6a4c" : "var(--brand-d)" }}>
              📍 {tr(lang,
                    q.distance_m >= 1000 ? `يبعد ${(q.distance_m / 1000).toFixed(1)} كم` : `يبعد ${q.distance_m} م`,
                    q.distance_m >= 1000 ? `${(q.distance_m / 1000).toFixed(1)} km away` : `${q.distance_m} m away`)}
            </span>
          )}
          {q.confirmed_at && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold"
              style={{ background: "linear-gradient(160deg,#fbf1ea,#f4ddd0)", border: "1px solid rgba(102,28,10,0.16)", color: "var(--brand-d)" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {tr(lang, "أكّد حضوره", "Confirmed")}
            </span>
          )}
        </div>
        <QueueActions id={q.id} name={cust?.full_name ?? tr(lang, "عميلنا", "our guest")} phone={cust?.phone ?? ""} restaurant={restaurant.name} position={rank} />
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
        <ul className="space-y-2.5">{rows.map((q, i) => <Card key={q.id} q={q} rank={i + 1} />)}</ul>
      ) : (
        <div className="soft-card py-8 text-center text-sm text-[color:var(--muted)]">{tr(lang, "لا أحد بالانتظار", "No one waiting")}</div>
      )}
    </div>
  );

  return (
    <>
      {/* تحديث تلقائي كل 10ث (بلا Realtime، بلا إعادة تحميل كامل) */}
      <AutoRefresh intervalMs={10_000} />

      <div className="mb-5 hidden items-center justify-between lg:flex">
        <div>
          <h1 className="font-display text-3xl font-bold text-[color:var(--ink)]">{tr(lang, "الاستقبال", "Reception")}</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "الطابور الحيّ — إجلاس، تنبيه، وإدارة", "Live queue — seat, notify, and manage")}</p>
        </div>
        {activeBranch && (
          <a href={`/tv/${activeBranch.id}`} target="_blank" rel="noreferrer"
             className="rounded-2xl px-4 py-2.5 text-sm font-extrabold text-white"
             style={{ background: "linear-gradient(150deg,#b23c1d,#661c0a)" }}>
            📺 {tr(lang, "شاشة العرض", "TV display")}
          </a>
        )}
      </div>

      {/* تبويبات الفروع — كل فرع قسم مستقل تمامًا */}
      {multi && activeBranch && (
        <BranchTabs branches={branchList} activeId={activeBranch.id} />
      )}

      {activeBranch ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={tr(lang, "في الطابور الآن", "In queue now")} value={toAr(list.length)} tone="var(--brand-d)" />
            <Stat label={tr(lang, "طابور داخلي", "Indoor queue")} value={toAr(inside.length)} tone="var(--st-full)" />
            <Stat label={tr(lang, "طابور خارجي", "Outdoor queue")} value={toAr(outside.length)} tone="var(--st-full)" />
            <Stat label={tr(lang, "خدمناهم اليوم", "Served today")} value={toAr(servedToday)} tone="var(--st-open)" />
          </div>

          <WalkInForm branchId={activeBranch.id} branchName={multi ? activeBranch.name : undefined} />

          <div className="grid gap-6 sm:grid-cols-2">
            <ZoneColumn title={tr(lang, "طاولات داخلية", "Indoor tables")} rows={inside} tone="var(--st-full)" />
            <ZoneColumn title={tr(lang, "طاولات خارجية", "Outdoor tables")} rows={outside} tone="var(--st-full)" />
          </div>
          {other.length > 0 && (
            <div className="mt-6"><ZoneColumn title={tr(lang, "غير محدّد", "Unspecified")} rows={other} tone="var(--muted)" /></div>
          )}
        </>
      ) : (
        <div className="soft-card py-12 text-center text-sm text-[color:var(--muted)]">
          {tr(lang, "لا يوجد فرع نشِط بعد.", "No active branch yet.")}
        </div>
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
