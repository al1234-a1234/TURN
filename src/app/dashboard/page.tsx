import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { CreateRestaurantForm } from "./create-restaurant-form";

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكّد",
  seated: "جالس",
  completed: "مكتمل",
  cancelled: "ملغى",
  no_show: "لم يحضر",
  waiting: "في الانتظار",
  notified: "أُشعِر",
  expired: "منتهٍ",
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200",
  pending: "bg-gold-400/15 text-gold-600 dark:text-gold-300",
  seated: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  waiting: "bg-gold-400/15 text-gold-600 dark:text-gold-300",
  notified: "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200",
};

const STATUS_ROLE: Record<string, string> = {
  owner: "مالك",
  manager: "مدير",
  staff: "موظف",
  host: "مضيف",
};

function formatDateTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <p className="text-stone-600 dark:text-stone-300">
          يجب تسجيل الدخول.{" "}
          <Link href="/login" className="font-bold text-brand-600">تسجيل الدخول</Link>
        </p>
      </Shell>
    );
  }

  const { data: staffRows } = await supabase
    .from("staff")
    .select("id, role, restaurants(id, name, slug)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);

  const membership = staffRows?.[0];
  const restaurant = membership?.restaurants;

  if (!restaurant) {
    return (
      <Shell email={user.email}>
        <CreateRestaurantForm />
      </Shell>
    );
  }

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, city, timezone, is_active")
    .eq("restaurant_id", restaurant.id)
    .order("created_at");

  const branchIds = (branches ?? []).map((b) => b.id);
  const defaultTz = branches?.[0]?.timezone ?? "Asia/Riyadh";

  const { data: reservations } = branchIds.length
    ? await supabase
        .from("reservations")
        .select("id, reserved_at, party_size, status, customers(full_name, phone), tables(label)")
        .in("branch_id", branchIds)
        .gte("reserved_at", new Date().toISOString())
        .order("reserved_at")
        .limit(20)
    : { data: [] };

  const { data: waitlist } = branchIds.length
    ? await supabase
        .from("waitlist_entries")
        .select("id, party_size, status, position, customers(full_name)")
        .in("branch_id", branchIds)
        .in("status", ["waiting", "notified"])
        .order("position", { nullsFirst: false })
        .limit(20)
    : { data: [] };

  return (
    <Shell email={user.email}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow mb-3">{STATUS_ROLE[membership.role] ?? membership.role}</span>
          <h1 className="text-3xl font-extrabold text-brand-900 dark:text-white">{restaurant.name}</h1>
        </div>
        <Link href={`/r/${restaurant.slug}`} className="btn btn-ghost h-11 px-5">
          الصفحة العامة ↗
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-3 gap-4">
        <StatCard label="حجوزات قادمة" value={reservations?.length ?? 0} icon="📅" />
        <StatCard label="في الانتظار" value={waitlist?.length ?? 0} icon="⏱️" />
        <StatCard label="الفروع" value={branches?.length ?? 0} icon="🏬" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-bold">
            <span>📅</span> الحجوزات القادمة
          </h2>
          {reservations && reservations.length > 0 ? (
            <ul className="space-y-2">
              {reservations.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] p-3 transition hover:bg-sand-100/70 dark:hover:bg-stone-800/40">
                  <Avatar name={r.customers?.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{r.customers?.full_name ?? "عميل"}</p>
                    <p className="text-sm text-stone-500">
                      {formatDateTime(r.reserved_at, defaultTz)} · {r.party_size} أشخاص
                      {r.tables?.label ? ` · ${r.tables.label}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="🗓️" text="لا توجد حجوزات قادمة بعد" />
          )}
        </section>

        <section className="card p-6">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-bold">
            <span>⏱️</span> قائمة الانتظار
          </h2>
          {waitlist && waitlist.length > 0 ? (
            <ul className="space-y-2">
              {waitlist.map((w) => (
                <li key={w.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] p-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 font-extrabold text-white">
                    {w.position ?? "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{w.customers?.full_name ?? "عميل"}</p>
                    <p className="text-sm text-stone-500">{w.party_size} أشخاص</p>
                  </div>
                  <StatusBadge status={w.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="🎉" text="لا أحد في قائمة الانتظار حاليًا" />
          )}
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children, email }: { children: React.ReactNode; email?: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--border)]/70 bg-[var(--background)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-brand-500 text-white shadow-[var(--shadow-lift)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
            </span>
            <span className="text-lg font-extrabold text-brand-700 dark:text-brand-300">دور</span>
          </Link>
          <div className="flex items-center gap-3">
            {email && <span className="hidden text-sm text-stone-500 sm:inline" dir="ltr">{email}</span>}
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-xl dark:bg-brand-900/40">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-extrabold text-brand-800 dark:text-brand-200">{value}</p>
        <p className="text-xs text-stone-500">{label}</p>
      </div>
    </div>
  );
}

function Avatar({ name }: { name?: string | null }) {
  const letter = (name ?? "ع").trim().charAt(0) || "ع";
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-100 to-sand-200 font-extrabold text-brand-700 dark:from-brand-900/60 dark:to-stone-800 dark:text-brand-200">
      {letter}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-sand-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300";
  return <span className={`badge ${style}`}>{STATUS_LABELS[status] ?? status}</span>;
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="text-sm text-stone-400">{text}</p>
    </div>
  );
}
