import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { QueueActions } from "./queue-actions";
import { OwnerHeader, OwnerTabs } from "./owner-chrome";
import { loadOwner } from "./owner-context";
import { toAr } from "@/lib/format";

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export default async function DashboardPage() {
  const load = await loadOwner();

  if (load.state === "no_user") {
    return (
      <div className="flex flex-1 flex-col">
        <OwnerHeader />
        <main className="mx-auto w-full max-w-3xl px-5 py-10">
          <p className="text-[color:var(--muted)]">
            يجب تسجيل الدخول.{" "}
            <Link href="/partners" className="font-bold text-brand-700">تسجيل الدخول</Link>
          </p>
        </main>
      </div>
    );
  }

  if (load.state === "no_restaurant") {
    return (
      <div className="flex flex-1 flex-col">
        <OwnerHeader email={load.email ?? undefined} />
        <main className="mx-auto max-w-xl px-5 py-10">
          <div className="soft-card flex flex-col items-center gap-4 p-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl" style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}>🍽️</span>
            <h1 className="font-display text-2xl font-bold text-[color:var(--ink)]">لا يوجد مطعم مرتبط بحسابك</h1>
            <p className="max-w-sm text-sm text-[color:var(--muted)]">حسابات الملّاك تُنشأ من قِبل إدارة دور فقط. تواصل معنا لإضافة مطعمك.</p>
            <a href="mailto:albraalaan@gmail.com" className="btn btn-primary w-full max-w-xs">تواصل مع الإدارة</a>
            {load.isAdmin && <Link href="/admin" className="btn btn-secondary mt-2 w-full max-w-xs">⚙️ لوحة الأدمِن</Link>}
          </div>
        </main>
      </div>
    );
  }

  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  const { data: branches } = await supabase
    .from("branches").select("id, name").eq("restaurant_id", restaurant.id).order("created_at");
  const branchIds = (branches ?? []).map((b) => b.id);

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [{ data: queue }, todayRes] = branchIds.length
    ? await Promise.all([
        supabase
          .from("waitlist_entries")
          .select("id, position, party_size, zone, status, joined_at, customers(full_name, phone)")
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
          <p className="truncate font-bold text-[color:var(--ink)]">{cust?.full_name ?? "عميل"}</p>
          <p className="text-sm text-[color:var(--muted)]" dir="ltr">{cust?.phone ?? "—"}</p>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">
            {toAr(q.party_size)} أشخاص · ⏱ {toAr(waited)} دقيقة{q.status === "notified" ? " · أُشعِر ✓" : ""}
          </p>
        </div>
        <QueueActions id={q.id} name={cust?.full_name ?? "عميلنا"} phone={cust?.phone ?? ""} restaurant={restaurant.name} position={q.position} />
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
        <div className="soft-card py-8 text-center text-sm text-[color:var(--muted)]">لا أحد بالانتظار</div>
      )}
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      <OwnerHeader title={restaurant.name} slug={restaurant.slug} actions={<LogoutButton />} />
      <main className="mx-auto -mt-8 w-full max-w-3xl flex-1 px-5 pb-16">
        <OwnerTabs active="reception" modules={modules} role={role} permissions={permissions} />

        {/* الأرقام */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="في الطابور الآن" value={toAr(list.length)} tone="var(--brand-d)" />
          <Stat label="طابور داخلي" value={toAr(inside.length)} tone="var(--st-full)" />
          <Stat label="طابور خارجي" value={toAr(outside.length)} tone="var(--st-full)" />
          <Stat label="خدمناهم اليوم" value={toAr(servedToday)} tone="var(--st-open)" />
        </div>

        {/* الطابور مقسّم داخلي/خارجي */}
        <div className="grid gap-6 sm:grid-cols-2">
          <ZoneColumn title="طاولات داخلية" rows={inside} tone="var(--st-full)" />
          <ZoneColumn title="طاولات خارجية" rows={outside} tone="var(--st-full)" />
        </div>
        {other.length > 0 && (
          <div className="mt-6"><ZoneColumn title="غير محدّد" rows={other} tone="var(--muted)" /></div>
        )}
      </main>
    </div>
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
