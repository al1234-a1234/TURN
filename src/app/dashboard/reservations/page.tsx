import { redirect } from "next/navigation";
import { loadOwner } from "../owner-context";
import { resolveBranchScope } from "../branch-scope";
import { BranchPicker } from "../branch-picker";
import { staffHasPermission } from "@/lib/features";
import { getLang } from "@/lib/i18n-server";
import { ScreenGuide } from "@/components/screen-guide";
import { tr } from "@/lib/i18n";
import { toAr } from "@/lib/format";
import { riyadhDayStart } from "@/lib/dates";
import { NewReservation } from "./new-reservation";
import { ReservationActions } from "./reservation-actions";
import type { Database } from "@/lib/supabase/database.types";

type Reservation = Database["public"]["Tables"]["reservations"]["Row"] & {
  customers: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null;
  tables: { label: string; seats: number } | { label: string; seats: number }[] | null;
};

const STATUS_META: Record<string, { ar: string; en: string; color: string }> = {
  pending: { ar: "بانتظار التأكيد", en: "Pending", color: "var(--st-full)" },
  confirmed: { ar: "مؤكّد", en: "Confirmed", color: "var(--st-open)" },
  seated: { ar: "حضر", en: "Seated", color: "var(--muted)" },
  completed: { ar: "مكتمل", en: "Completed", color: "var(--muted)" },
  cancelled: { ar: "ملغى", en: "Cancelled", color: "var(--st-closed)" },
  no_show: { ar: "لم يحضر", en: "No-show", color: "var(--st-closed)" },
};

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, role, permissions } = load.ctx;
  if (!staffHasPermission(role, permissions, "reservations")) redirect("/dashboard");

  // كل فرع قسم مستقل: الحجوزات والتفعيل يتبعان الفرع المختار، لا الفرع الأقدم
  const scope = await resolveBranchScope(load.ctx, (await searchParams).branch);
  const activeBranch = scope.active;

  const { data: bs } = activeBranch
    ? await supabase.from("branch_settings").select("accepts_reservations").eq("branch_id", activeBranch.id).maybeSingle()
    : { data: null };
  const acceptsReservations = bs?.accepts_reservations ?? false;

  // أقسام الفرع بأسماء المالك — الفعّالة وحدها تُحجَز فيها طاولة
  const { data: zoneRows } = activeBranch
    ? await supabase.from("branch_zones").select("key, name, name_en, sort_order")
        .eq("branch_id", activeBranch.id).eq("is_active", true).order("sort_order")
    : { data: [] };
  const zones = (zoneRows ?? []).map((z) => ({ key: z.key, name: z.name, nameEn: z.name_en }));

  if (!acceptsReservations) {
    return (
      <div className="soft-card mx-auto max-w-md p-8 text-center">
        <p className="text-3xl">📅</p>
        <h1 className="mt-2 font-display text-xl font-bold text-[color:var(--ink)]">{tr(lang, "الحجوزات موقّفة", "Reservations are off")}</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {tr(lang, "الحجز المسبق للطاولات منفصل عن طابور الحضور. فعّله ليبدأ استقبال الحجوزات.", "Advance table booking is separate from the walk-in queue. Enable it to start accepting reservations.")}
        </p>
        {activeBranch && scope.multi && (
          <p className="mt-3 text-xs font-bold text-[color:var(--muted)]">
            {tr(lang, `الفرع المعروض: ${activeBranch.name}`, `Showing branch: ${activeBranch.name}`)}
          </p>
        )}
        <a href={`/dashboard/manage${activeBranch ? `?branch=${activeBranch.id}` : ""}`} className="btn btn-primary mt-5 inline-flex w-full max-w-xs">{tr(lang, "تفعيل من الإعدادات", "Enable in settings")}</a>
        {scope.multi && (
          <div className="mt-6 text-start"><BranchPicker branches={scope.branches} activeId={activeBranch?.id ?? ""} /></div>
        )}
      </div>
    );
  }

  const { data } = activeBranch
    ? await supabase
        .from("reservations")
        .select("id, reserved_at, party_size, status, notes, table_id, customers(full_name, phone), tables(label, seats)")
        .eq("branch_id", activeBranch.id)
        .gte("reserved_at", new Date(Date.now() - 6 * 3600e3).toISOString()).order("reserved_at")
        .limit(200)
    : { data: [] };
  const list = (data ?? []) as Reservation[];

  const now = Date.now();
  const startToday = riyadhDayStart();
  const endToday = new Date(riyadhDayStart(-1).getTime() - 1);
  const active = list.filter((r) => r.status === "pending" || r.status === "confirmed");
  const todayCount = list.filter((r) => {
    const t = new Date(r.reserved_at).getTime();
    return t >= startToday.getTime() && t <= endToday.getTime() && (r.status === "pending" || r.status === "confirmed");
  }).length;
  const guests = active.filter((r) => new Date(r.reserved_at).getTime() >= now).reduce((a, r) => a + r.party_size, 0);

  const dtFmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", {
      timeZone: "Asia/Riyadh",
      day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    });

  return (
    <>
      <div className="mb-5 hidden lg:block">
        <h1 className="font-display text-3xl font-bold text-[color:var(--ink)]">{tr(lang, "الحجوزات", "Reservations")}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "احجز طاولات مسبقًا وأدِر حضور العملاء", "Book tables ahead and manage arrivals")}</p>
      </div>

      <ScreenGuide
        lang={lang}
        anchor="owner"
        className="mb-5"
        lines={[
          tr(lang, "احجز طاولةً مسبقًا وأدِر حضور من حجز.", "Book a table ahead and manage who arrives."),
          tr(lang, "لكل حجزٍ حالة: بانتظار، مؤكّد، جلس، مكتمل، ملغى، لم يحضر.", "Each booking has a state: pending, confirmed, seated, completed, cancelled, no-show."),
          tr(lang, "حجزٌ بلا طاولة يظهر موسومًا — عيّنها يدويًّا عند الحضور.", "A booking with no table is flagged — assign one by hand on arrival."),
        ]}
      />

      {scope.multi && activeBranch && <BranchPicker branches={scope.branches} activeId={activeBranch.id} />}

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Kpi label={tr(lang, "حجوزات اليوم", "Today")} value={toAr(todayCount)} tone="var(--brand-d)" />
        <Kpi label={tr(lang, "قادمة", "Upcoming")} value={toAr(active.length)} tone="var(--st-open)" />
        <Kpi label={tr(lang, "إجمالي الضيوف", "Total guests")} value={toAr(guests)} tone="var(--st-full)" />
      </div>

      {activeBranch && (
        <NewReservation
          branchId={activeBranch.id}
          branchName={scope.multi ? activeBranch.name : undefined}
          zones={zones}
        />
      )}

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
              const t = Array.isArray(r.tables) ? r.tables[0] : r.tables;
              const sm = STATUS_META[r.status] ?? STATUS_META.confirmed;
              const openEnded = !r.table_id && (r.status === "pending" || r.status === "confirmed");
              return (
                <li key={r.id} className="soft-card flex items-center gap-3 p-4">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl text-cream-100" style={{ background: "var(--brand-solid)" }}>
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
                    {/* الطاولة هي الحجز: بلا اسمها لا يعرف المضيف أين يُجلسه،
                        ولا تعرف القاعدة أن الوقت شُغل. وحجزٌ قديمٌ بلا طاولة
                        يُقال صراحةً بدل أن يُقرأ كأنّه محجوز. */}
                    {t ? (
                      <p className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold"
                         style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--brand-d)" }}>
                        {tr(lang, `طاولة ${t.label}`, `Table ${t.label}`)}
                        <span className="font-bold opacity-70">· {toAr(t.seats)} {tr(lang, "مقاعد", "seats")}</span>
                      </p>
                    ) : openEnded ? (
                      <p className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold"
                         style={{ background: "var(--surface-2)", border: "1px solid rgba(156,59,38,0.35)", color: "var(--danger)" }}>
                        {tr(lang, "بلا طاولة — عيّنها يدويًّا عند الحضور", "No table — assign one on arrival")}
                      </p>
                    ) : null}
                    {r.notes && <p className="mt-1 text-xs text-[color:var(--ink)]">📝 {r.notes}</p>}
                  </div>
                  <ReservationActions id={r.id} status={r.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
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
