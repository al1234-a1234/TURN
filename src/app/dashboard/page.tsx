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

  // الحماية الأساسية في middleware، وهذا احتياط إضافي.
  if (!user) {
    return (
      <Shell>
        <p className="text-zinc-600 dark:text-zinc-300">
          يجب تسجيل الدخول.{" "}
          <Link href="/login" className="font-semibold text-teal-600">
            تسجيل الدخول
          </Link>
        </p>
      </Shell>
    );
  }

  // إيجاد عضوية الطاقم والمطعم المرتبط بها
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

  // الفروع
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, city, timezone, is_active")
    .eq("restaurant_id", restaurant.id)
    .order("created_at");

  const branchIds = (branches ?? []).map((b) => b.id);
  const defaultTz = branches?.[0]?.timezone ?? "Asia/Riyadh";

  // الحجوزات القادمة
  const { data: reservations } = branchIds.length
    ? await supabase
        .from("reservations")
        .select(
          "id, reserved_at, party_size, status, customers(full_name, phone), tables(label)",
        )
        .in("branch_id", branchIds)
        .gte("reserved_at", new Date().toISOString())
        .order("reserved_at")
        .limit(20)
    : { data: [] };

  // قائمة الانتظار النشطة
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{restaurant.name}</h1>
          <p className="text-sm text-zinc-500">
            دورك: {STATUS_ROLE[membership.role] ?? membership.role} ·{" "}
            {branches?.length ?? 0} فرع
          </p>
        </div>
        <Link
          href={`/r/${restaurant.slug}`}
          className="text-sm font-medium text-teal-600 hover:underline"
        >
          الصفحة العامة ↗
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* الحجوزات القادمة */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-lg font-semibold">الحجوزات القادمة</h2>
          {reservations && reservations.length > 0 ? (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {reservations.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">
                      {r.customers?.full_name ?? "عميل"}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {formatDateTime(r.reserved_at, defaultTz)} ·{" "}
                      {r.party_size} أشخاص
                      {r.tables?.label ? ` · ${r.tables.label}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="لا توجد حجوزات قادمة" />
          )}
        </section>

        {/* قائمة الانتظار */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-lg font-semibold">قائمة الانتظار</h2>
          {waitlist && waitlist.length > 0 ? (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {waitlist.map((w) => (
                <li key={w.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">
                      {w.position ? `#${w.position} · ` : ""}
                      {w.customers?.full_name ?? "عميل"}
                    </p>
                    <p className="text-sm text-zinc-500">{w.party_size} أشخاص</p>
                  </div>
                  <StatusBadge status={w.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="لا أحد في قائمة الانتظار حاليًا" />
          )}
        </section>
      </div>
    </Shell>
  );
}

const STATUS_ROLE: Record<string, string> = {
  owner: "مالك",
  manager: "مدير",
  staff: "موظف",
  host: "مضيف",
};

function Shell({
  children,
  email,
}: {
  children: React.ReactNode;
  email?: string;
}) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="text-xl font-extrabold text-teal-700 dark:text-teal-400"
          >
            دور · لوحة التحكم
          </Link>
          <div className="flex items-center gap-3">
            {email && (
              <span className="hidden text-sm text-zinc-500 sm:inline" dir="ltr">
                {email}
              </span>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-zinc-400">{text}</p>;
}
