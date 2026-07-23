import { redirect } from "next/navigation";
import { OwnerShell } from "../owner-shell";
import { loadOwner } from "../owner-context";
import { staffHasPermission } from "@/lib/features";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";
import { toAr } from "@/lib/format";
import { createReservation } from "./actions";
import { ReservationActions } from "./reservation-actions";
import type { Database } from "@/lib/supabase/database.types";

type Reservation = Database["public"]["Tables"]["reservations"]["Row"] & {
  customers: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null;
};

const STATUS_META: Record<string, { ar: string; en: string; color: string }> = {
  pending: { ar: "بانتظار التأكيد", en: "Pending", color: "var(--st-full)" },
  confirmed: { ar: "مؤكّد", en: "Confirmed", color: "var(--st-open)" },
  seated: { ar: "حضر", en: "Seated", color: "var(--muted)" },
  completed: { ar: "مكتمل", en: "Completed", color: "var(--muted)" },
  cancelled: { ar: "ملغى", en: "Cancelled", color: "var(--st-closed)" },
  no_show: { ar: "لم يحضر", en: "No-show", color: "var(--st-closed)" },
};

export default async function ReservationsPage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") redirect("/dashboard");
  const { supabase, restaurant, modules, role, permissions } = load.ctx;
  if (!staffHasPermission(role, permissions, "reservations")) redirect("/dashboard");

  const { data: branches } = await supabase.from("branches").select("id").eq("restaurant_id", restaurant.id).order("created_at");
  const branchIds = (branches ?? []).map((b) => b.id);

  const { data } = branchIds.length
    ? await supabase
        .from("reservations")
        .select("id, reserved_at, party_size, status, notes, customers(full_name, phone)")
        .in("branch_id", branchIds)
        .order("reserved_at")
        .limit(200)
    : { data: [] };
  const list = (data ?? []) as Reservation[];

  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const active = list.filter((r) => r.status === "pending" || r.status === "confirmed");
  const todayCount = list.filter((r) => {
    const t = new Date(r.reserved_at).getTime();
    return t >= startToday.getTime() && t <= endToday.getTime() && (r.status === "pending" || r.status === "confirmed");
  }).length;
  const guests = active.filter((r) => new Date(r.reserved_at).getTime() >= now).reduce((a, r) => a + r.party_size, 0);

  const dtFmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", {
      day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    });

  const field = "field-input";

  return (
    <OwnerShell active="reservations" restaurant={restaurant} modules={modules} role={role} permissions={permissions} counts={{ reservations: active.length }}>
      <div className="mb-5 hidden lg:block">
        <h1 className="font-display text-3xl font-bold text-[color:var(--ink)]">{tr(lang, "الحجوزات", "Reservations")}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "احجز طاولات مسبقًا وأدِر حضور العملاء", "Book tables ahead and manage arrivals")}</p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Kpi label={tr(lang, "حجوزات اليوم", "Today")} value={toAr(todayCount)} tone="var(--brand-d)" />
        <Kpi label={tr(lang, "قادمة", "Upcoming")} value={toAr(active.length)} tone="var(--st-open)" />
        <Kpi label={tr(lang, "إجمالي الضيوف", "Total guests")} value={toAr(guests)} tone="var(--st-full)" />
      </div>

      <section className="soft-card mb-6 p-5">
        <h2 className="mb-4 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "حجز جديد", "New reservation")}</h2>
        <form action={createReservation} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="full_name" placeholder={tr(lang, "اسم العميل", "Customer name")} className={field} />
            <input name="phone" required dir="ltr" placeholder="05xxxxxxxx" className={field} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="datetime-local" name="reserved_at" required className={field} />
            <input name="party_size" inputMode="numeric" defaultValue="2" placeholder={tr(lang, "عدد الأشخاص", "Party size")} className={field} />
          </div>
          <input name="notes" placeholder={tr(lang, "ملاحظات (اختياري)", "Notes (optional)")} className={field} />
          <button className="btn btn-primary w-full">{tr(lang, "تأكيد الحجز", "Confirm reservation")}</button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "قائمة الحجوزات", "All reservations")}</h2>
        {list.length === 0 ? (
          <div className="soft-card py-10 text-center">
            <p className="text-2xl">📅</p>
            <p className="mt-2 font-bold text-[color:var(--ink)]">{tr(lang, "لا توجد حجوزات", "No reservations")}</p>
            <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "أنشئ أول حجز من الأعلى.", "Create the first reservation above.")}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((r) => {
              const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
              const sm = STATUS_META[r.status] ?? STATUS_META.confirmed;
              return (
                <li key={r.id} className="soft-card flex items-center gap-3 p-4">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl text-white" style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}>
                    <span className="font-display text-lg font-bold leading-none">{toAr(r.party_size)}</span>
                    <span className="text-[9px]">{tr(lang, "أشخاص", "pax")}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-[color:var(--ink)]">{c?.full_name ?? tr(lang, "عميل", "Customer")}</p>
                    <p className="text-sm text-[color:var(--muted)]" dir="ltr">{c?.phone ?? "—"}</p>
                    <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                      🕐 {dtFmt(r.reserved_at)}
                      <span className="ms-2 font-bold" style={{ color: sm.color }}>· {tr(lang, sm.ar, sm.en)}</span>
                    </p>
                    {r.notes && <p className="mt-1 text-xs text-[color:var(--ink)]">📝 {r.notes}</p>}
                  </div>
                  <ReservationActions id={r.id} status={r.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </OwnerShell>
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
