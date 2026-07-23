import { redirect } from "next/navigation";
import Link from "next/link";
import { loadOwner } from "../../owner-context";
import { RewardForm } from "./reward-form";
import { revokeReward } from "../actions";
import { staffHasPermission } from "@/lib/features";
import { toAr, money } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

type CustomerRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  created_at: string;
};

type ProfileRow = {
  visits: number;
  points: number;
  tier: string;
  is_vip: boolean;
  is_blocked: boolean;
  no_shows: number;
  tags: string[];
  note: string | null;
  last_visit: string | null;
  first_seen: string;
};

type VisitRow = {
  id: string;
  joined_at: string;
  seated_at: string | null;
  status: "waiting" | "notified" | "seated" | "cancelled" | "no_show" | "expired";
  party_size: number;
  zone: string;
};

type ReservationRow = {
  id: string;
  reserved_at: string;
  party_size: number;
  status: "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show";
  notes: string | null;
};

type RewardRow = {
  id: string;
  kind: string;
  title: string;
  value: number | null;
  value_kind: string;
  description: string | null;
  code: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
};

const TIER_META: Record<string, { label: string; labelEn: string; color: string; bg: string }> = {
  vip: { label: "VIP", labelEn: "VIP", color: "#661c0a", bg: "#f8e9e3" },
  gold: { label: "ذهبي", labelEn: "Gold", color: "#8a6a12", bg: "#faf1d8" },
  silver: { label: "فضي", labelEn: "Silver", color: "#5b6470", bg: "#eef1f4" },
  regular: { label: "عادي", labelEn: "Regular", color: "var(--muted)", bg: "var(--surface-2)" },
};

function fmtDateTime(iso: string | null, lang: "ar" | "en"): string {
  if (!iso) return "—";
  // أرقام لاتينية دائمًا
  return new Date(iso).toLocaleString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDate(iso: string | null, lang: "ar" | "en"): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(iso: string | null, lang: "ar" | "en"): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function rewardValueLabel(r: RewardRow): string {
  if (r.kind !== "discount" || r.value == null) return "";
  return r.value_kind === "amount" ? money(r.value) : `${toAr(r.value)}%`;
}

function zoneLabel(zone: string, lang: "ar" | "en"): string {
  if (zone === "outside") return tr(lang, "خارجي", "Outdoor");
  if (zone === "inside") return tr(lang, "داخلي", "Indoor");
  return zone;
}

function visitStatus(status: VisitRow["status"], lang: "ar" | "en"): { label: string; color: string } {
  switch (status) {
    case "seated":
      return { label: tr(lang, "حضر", "Seated"), color: "var(--st-open)" };
    case "cancelled":
      return { label: tr(lang, "ملغى", "Cancelled"), color: "var(--st-closed)" };
    case "no_show":
      return { label: tr(lang, "لم يحضر", "No-show"), color: "var(--st-closed)" };
    case "expired":
      return { label: tr(lang, "منتهٍ", "Expired"), color: "var(--muted)" };
    default:
      return { label: tr(lang, "بالطابور", "In queue"), color: "var(--st-full)" };
  }
}

function reservationStatus(
  status: ReservationRow["status"],
  lang: "ar" | "en",
): { label: string; color: string } {
  switch (status) {
    case "completed":
    case "seated":
      return { label: tr(lang, "حضر", "Seated"), color: "var(--st-open)" };
    case "confirmed":
      return { label: tr(lang, "مؤكّد", "Confirmed"), color: "var(--st-full)" };
    case "cancelled":
      return { label: tr(lang, "ملغى", "Cancelled"), color: "var(--st-closed)" };
    case "no_show":
      return { label: tr(lang, "لم يحضر", "No-show"), color: "var(--st-closed)" };
    default:
      return { label: tr(lang, "قيد الانتظار", "Pending"), color: "var(--muted)" };
  }
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  if (!staffHasPermission(role, permissions, "customers")) redirect("/dashboard");

  const { data: branchRows } = await supabase.from("branches").select("id").eq("restaurant_id", restaurant.id);
  const branchIds = (branchRows ?? []).map((b) => b.id);

  const [customerRes, profileRes, visitsRes, reservationsRes, rewardsRes] = await Promise.all([
    supabase.from("customers").select("id, full_name, phone, email, created_at").eq("id", id).maybeSingle(),
    supabase
      .from("customer_restaurant")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("customer_id", id)
      .maybeSingle(),
    supabase
      .from("waitlist_entries")
      .select("id, joined_at, seated_at, status, party_size, zone")
      .eq("customer_id", id)
      .in("branch_id", branchIds)
      .order("joined_at", { ascending: false })
      .limit(100),
    supabase
      .from("reservations")
      .select("id, reserved_at, party_size, status, notes")
      .eq("customer_id", id)
      .in("branch_id", branchIds)
      .order("reserved_at", { ascending: false })
      .limit(100),
    supabase
      .from("customer_rewards")
      .select("id, kind, title, value, value_kind, description, code, status, expires_at, created_at")
      .eq("restaurant_id", restaurant.id)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const customer = customerRes.data as CustomerRow | null;
  if (!customer) redirect("/dashboard/customers");

  const profile = profileRes.data as ProfileRow | null;
  const visits = (visitsRes.data ?? []) as VisitRow[];
  const reservations = (reservationsRes.data ?? []) as ReservationRow[];
  const rewards = (rewardsRes.data ?? []) as RewardRow[];

  const tm = TIER_META[profile?.tier ?? "regular"] ?? TIER_META.regular;
  const name = customer.full_name?.trim() || tr(lang, "عميل", "Customer");

  return (
    <div className="space-y-6">
        <Link href="/dashboard/customers" className="inline-flex text-sm font-bold text-brand-700">
          {tr(lang, "← العملاء", "← Customers")}
        </Link>

        {/* ===== بطاقة الملف ===== */}
        <div className="soft-card p-5">
          <div className="flex items-center gap-4">
            <span
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-display text-2xl font-bold"
              style={{ background: tm.bg, color: tm.color }}
            >
              {name.charAt(0) || tr(lang, "؟", "?")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-2xl font-bold text-[color:var(--ink)]">{name}</h1>
                {profile?.is_vip && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                    style={{ background: "#f8e9e3", color: "#661c0a" }}
                  >
                    VIP
                  </span>
                )}
                {profile?.is_blocked && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white"
                    style={{ background: "var(--st-closed)" }}
                  >
                    {tr(lang, "محظور", "Blocked")}
                  </span>
                )}
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{ background: tm.bg, color: tm.color }}
                >
                  {tr(lang, tm.label, tm.labelEn)}
                </span>
              </div>
              <p className="mt-1 text-sm text-[color:var(--muted)]" dir="ltr">
                {customer.phone || "—"}
              </p>
              {customer.email && (
                <p className="text-sm text-[color:var(--muted)]" dir="ltr">
                  {customer.email}
                </p>
              )}
            </div>
          </div>

          {/* ===== مؤشرات ===== */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label={tr(lang, "الزيارات", "Visits")} value={toAr(profile?.visits ?? 0)} tone="var(--brand-d)" />
            <Kpi label={tr(lang, "النقاط", "Points")} value={toAr(profile?.points ?? 0)} tone="var(--st-open)" />
            <Kpi
              label={tr(lang, "تغيّبات", "No-shows")}
              value={toAr(profile?.no_shows ?? 0)}
              tone={profile && profile.no_shows > 0 ? "var(--st-closed)" : "var(--muted)"}
            />
            <Kpi
              label={tr(lang, "عضو منذ", "Member since")}
              value={fmtDate(profile?.first_seen ?? customer.created_at, lang)}
              tone="var(--st-full)"
            />
          </div>

          {profile?.tags && profile.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {profile.tags.map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
            </div>
          )}
          {profile?.note && (
            <p className="mt-3 rounded-xl bg-[color:var(--surface-2)] p-3 text-sm text-[color:var(--ink)]">
              📝 {profile.note}
            </p>
          )}
        </div>

        {/* ===== المكافآت والهدايا (تسويق وجذب) ===== */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-[color:var(--ink)]">
              {tr(lang, "المكافآت والهدايا", "Rewards & gifts")}
            </h2>
            <span className="text-xs text-[color:var(--muted)]">{tr(lang, "يصل العميل عبر رقمه", "Reaches the customer via their phone")}</span>
          </div>

          {rewards.filter((r) => r.status === "active").length > 0 && (
            <ul className="space-y-2">
              {rewards.filter((r) => r.status === "active").map((r) => (
                <li key={r.id} className="soft-card flex items-center gap-3 p-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl text-white" style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}>
                    {r.kind === "discount" ? "٪" : "🎁"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-[color:var(--ink)]">
                      {r.title}
                      {r.kind === "discount" && r.value != null ? ` · ${rewardValueLabel(r)}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                      {r.code ? <span dir="ltr" className="font-bold">{r.code}</span> : null}
                      {r.code && r.expires_at ? " · " : ""}
                      {r.expires_at ? tr(lang, `ينتهي ${fmtDate(r.expires_at, lang)}`, `Expires ${fmtDate(r.expires_at, lang)}`) : (!r.code ? tr(lang, "بلا انتهاء", "No expiry") : "")}
                    </p>
                  </div>
                  <form action={revokeReward}>
                    <input type="hidden" name="reward_id" value={r.id} />
                    <input type="hidden" name="customer_id" value={customer.id} />
                    <button className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-[color:var(--muted)] transition hover:text-red-600">{tr(lang, "إلغاء", "Revoke")}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <RewardForm customerId={customer.id} />
        </section>

        {/* ===== سجل الزيارات ===== */}
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-[color:var(--ink)]">
            {tr(lang, "سجل الزيارات", "Visit history")}
          </h2>
          {visits.length === 0 ? (
            <div className="soft-card py-8 text-center">
              <p className="text-2xl">🪑</p>
              <p className="mt-2 text-sm text-[color:var(--muted)]">
                {tr(lang, "لا توجد زيارات مسجّلة بعد.", "No visits recorded yet.")}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visits.map((v) => {
                const st = visitStatus(v.status, lang);
                return (
                  <li key={v.id} className="soft-card flex items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="font-bold text-[color:var(--ink)]">{fmtDateTime(v.joined_at, lang)}</p>
                      <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                        {zoneLabel(v.zone, lang)} ·{" "}
                        {tr(lang, `${toAr(v.party_size)} أشخاص`, `${toAr(v.party_size)} guests`)}
                        {v.seated_at ? tr(lang, ` · جلس ${fmtTime(v.seated_at, lang)}`, ` · Seated ${fmtTime(v.seated_at, lang)}`) : ""}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-white"
                      style={{ background: st.color }}
                    >
                      {st.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ===== الحجوزات السابقة ===== */}
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-[color:var(--ink)]">
            {tr(lang, "الحجوزات السابقة", "Reservations")}
          </h2>
          {reservations.length === 0 ? (
            <div className="soft-card py-8 text-center">
              <p className="text-2xl">📅</p>
              <p className="mt-2 text-sm text-[color:var(--muted)]">
                {tr(lang, "لا توجد حجوزات مسجّلة بعد.", "No reservations recorded yet.")}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {reservations.map((r) => {
                const st = reservationStatus(r.status, lang);
                return (
                  <li key={r.id} className="soft-card p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[color:var(--ink)]">{fmtDateTime(r.reserved_at, lang)}</p>
                        <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                          {tr(lang, `${toAr(r.party_size)} أشخاص`, `${toAr(r.party_size)} guests`)}
                        </p>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-white"
                        style={{ background: st.color }}
                      >
                        {st.label}
                      </span>
                    </div>
                    {r.notes && (
                      <p className="mt-2 rounded-xl bg-[color:var(--surface-2)] p-2 text-xs text-[color:var(--ink)]">
                        {r.notes}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="soft-card p-3 text-center">
      <p className="font-display text-xl font-bold leading-none" style={{ color: tone }}>
        {value}
      </p>
      <p className="mt-1.5 text-[11px] font-bold text-[color:var(--muted)]">{label}</p>
    </div>
  );
}
