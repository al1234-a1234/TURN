import { redirect } from "next/navigation";
import Link from "next/link";
import { loadOwner, scopeBranchIds } from "../../owner-context";
import { NO_BRANCH } from "../../branch-scope";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/dates";
import { RewardForm } from "./reward-form";
import { revokeReward, redeemReward } from "../actions";
import { isModuleOn, staffHasPermission } from "@/lib/features";
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
  branch_id: string;
  confirmed_at: string | null;
  distance_m: number | null;
};

type ReservationRow = {
  id: string;
  branch_id: string;
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


function rewardValueLabel(r: RewardRow, lang: "ar" | "en"): string {
  if (r.kind !== "discount" || r.value == null) return "";
  return r.value_kind === "amount" ? money(r.value, lang) : `${toAr(r.value)}${lang === "en" ? "%" : "٪"}`;
}

/**
 * اسم القسم كما سمّاه المالك.
 *
 * كانت تترجم مفتاحين مثبّتين وتُظهر ما عداهما خامًا («families») في ملفّ
 * العميل. الأسماء تُجلب من branch_zones ويبقى المفتاح آخر ملاذ.
 */
function zoneLabel(zone: string, names: Map<string, string>, lang: "ar" | "en"): string {
  return names.get(zone) ?? (zone || tr(lang, "بلا قسم", "No area"));
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

  if (!isModuleOn(modules, "crm") || !staffHasPermission(role, permissions, "customers")) redirect("/dashboard");

  const { data: branchRows } = await supabase.from("branches").select("id, name").eq("restaurant_id", restaurant.id);
  // عزل الفرانشايز: حساب مربوط بفرع يرى سجلّ العميل في فرعه فقط
  const branchIds = scopeBranchIds(load.ctx, (branchRows ?? []).map((b) => b.id));
  // اسم الفرع لكل سطر — بعد فصل الفروع صار ضروريًّا معرفة أي فرع زاره
  const branchName = new Map((branchRows ?? []).map((b) => [b.id, b.name]));
  // أسماء الأقسام كما سمّاها المالك — المفتاح وحده كان يظهر خامًا في السجلّ
  const { data: zoneRows } = branchIds.length
    ? await supabase.from("branch_zones").select("key, name").in("branch_id", branchIds)
    : { data: [] as { key: string; name: string }[] };
  const zoneNames = new Map<string, string>();
  for (const z of zoneRows ?? []) if (!zoneNames.has(z.key)) zoneNames.set(z.key, z.name);

  const [customerRes, profileRes, visitsRes, reservationsRes, rewardsRes, reviewsRes] = await Promise.all([
    supabase.from("customers").select("id, full_name, phone, email, created_at").eq("id", id).maybeSingle(),
    supabase
      .from("customer_restaurant")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("customer_id", id)
      .maybeSingle(),
    supabase
      .from("waitlist_entries")
      .select("id, joined_at, seated_at, status, party_size, zone, branch_id, confirmed_at, distance_m")
      .eq("customer_id", id)
      .in("branch_id", branchIds.length ? branchIds : [NO_BRANCH])
      .order("joined_at", { ascending: false })
      .limit(500),
    supabase
      .from("reservations")
      .select("id, reserved_at, party_size, status, notes, branch_id")
      .eq("customer_id", id)
      .in("branch_id", branchIds.length ? branchIds : [NO_BRANCH])
      .order("reserved_at", { ascending: false })
      .limit(500),
    supabase
      .from("customer_rewards")
      .select("id, kind, title, value, value_kind, description, code, status, expires_at, created_at")
      .eq("restaurant_id", restaurant.id)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("reviews")
      .select("id, rating, comment, created_at, is_published")
      .eq("restaurant_id", restaurant.id)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const customer = customerRes.data as CustomerRow | null;
  if (!customer) redirect("/dashboard/customers");

  const profile = profileRes.data as ProfileRow | null;
  const visits = (visitsRes.data ?? []) as VisitRow[];
  const reservations = (reservationsRes.data ?? []) as ReservationRow[];
  const rewards = (rewardsRes.data ?? []) as RewardRow[];
  const reviews = (reviewsRes.data ?? []) as { id: string; rating: number; comment: string | null; created_at: string; is_published: boolean }[];

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
              style={{ background: "var(--surface-2)", color: "var(--brand-solid)" }}
            >
              {name.charAt(0) || tr(lang, "؟", "?")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-2xl font-bold text-[color:var(--ink)]">{name}</h1>
                {profile?.is_vip && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                    style={{ background: "rgba(120,30,12,0.10)", color: "var(--brand-solid)" }}
                  >
                    VIP
                  </span>
                )}
                {profile?.is_blocked && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-extrabold text-cream-100"
                    style={{ background: "var(--st-closed)" }}
                  >
                    {tr(lang, "محظور", "Blocked")}
                  </span>
                )}
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

          {/* ===== مؤشرات — الزيارات على مستوى العلامة، والسجلّ على مستوى فرعك ===== */}
          {load.ctx.branchId && (
            <p className="mt-5 rounded-2xl px-3 py-2 text-[11px] font-bold"
               style={{ background: "var(--surface-2)", color: "var(--muted)", border: "1px solid rgba(102,28,10,0.12)" }}>
              {tr(lang,
                "الزيارات تُحسب على مستوى العلامة (تشمل بقيّة الفروع)، أمّا السجلّ أدناه فزياراته في فرعك وحده.",
                "Visits are counted brand-wide (including other branches); the history below is this branch only.")}
            </p>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi label={tr(lang, "الزيارات", "Visits")} value={toAr(profile?.visits ?? 0)} tone="var(--brand-d)" />
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
              {tr(lang, "المكافآت والهدايا", "Rewards & gifts")} <span className="text-sm font-bold text-[color:var(--muted)]">({toAr(rewards.length)})</span>
            </h2>
            <span className="text-xs text-[color:var(--muted)]">{tr(lang, "يصل العميل عبر رقمه", "Reaches the customer via their phone")}</span>
          </div>

          {rewards.filter((r) => r.status === "active").length > 0 && (
            <ul className="space-y-2">
              {rewards.filter((r) => r.status === "active").map((r) => (
                <li key={r.id} className="soft-card flex items-center gap-3 p-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl text-cream-100" style={{ background: "var(--brand-solid)" }}>
                    {r.kind === "discount" ? "٪" : "🎁"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-[color:var(--ink)]">
                      {r.title}
                      {r.kind === "discount" && r.value != null ? ` · ${rewardValueLabel(r, lang)}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                      {r.code ? <span dir="ltr" className="font-bold">{r.code}</span> : null}
                      {r.code && r.expires_at ? " · " : ""}
                      {r.expires_at ? tr(lang, `ينتهي ${fmtDate(r.expires_at, lang)}`, `Expires ${fmtDate(r.expires_at, lang)}`) : (!r.code ? tr(lang, "بلا انتهاء", "No expiry") : "")}
                    </p>
                  </div>
                  <form action={redeemReward} className="shrink-0">
                    <input type="hidden" name="reward_id" value={r.id} />
                    <input type="hidden" name="customer_id" value={customer.id} />
                    <button className="rounded-lg bg-[color:var(--sage)] px-2.5 py-1 text-xs font-bold text-brand-800 transition hover:brightness-95">{tr(lang, "اعتمد الاستخدام ✓", "Redeem ✓")}</button>
                  </form>
                  <form action={revokeReward} className="shrink-0">
                    <input type="hidden" name="reward_id" value={r.id} />
                    <input type="hidden" name="customer_id" value={customer.id} />
                    <button className="rounded-lg px-2 py-1 text-xs font-bold text-[color:var(--muted)] transition hover:text-[color:var(--danger)]">{tr(lang, "إلغاء", "Revoke")}</button>
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
            {tr(lang, "سجل الزيارات", "Visit history")} <span className="text-sm font-bold text-[color:var(--muted)]">({toAr(visits.length)})</span>
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
                        {branchName.get(v.branch_id) ?? tr(lang, "فرع", "Branch")} · {zoneLabel(v.zone, zoneNames, lang)} ·{" "}
                        {tr(lang, `${toAr(v.party_size)} أشخاص`, `${toAr(v.party_size)} guests`)}
                        {v.seated_at ? tr(lang, ` · جلس ${fmtTime(v.seated_at, lang)}`, ` · Seated ${fmtTime(v.seated_at, lang)}`) : ""}
                        {v.confirmed_at ? tr(lang, " · أكّد الحضور ✓", " · Confirmed ✓") : ""}
                        {v.distance_m != null
                          ? (v.distance_m >= 1000
                              ? tr(lang, ` · كان يبعد ${(v.distance_m / 1000).toFixed(1)} كم`, ` · was ${(v.distance_m / 1000).toFixed(1)} km away`)
                              : tr(lang, ` · كان يبعد ${v.distance_m} م`, ` · was ${v.distance_m} m away`))
                          : ""}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-cream-100"
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
            {tr(lang, "الحجوزات السابقة", "Reservations")} <span className="text-sm font-bold text-[color:var(--muted)]">({toAr(reservations.length)})</span>
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
                          {branchName.get(r.branch_id) ?? tr(lang, "فرع", "Branch")} ·{" "}
                          {tr(lang, `${toAr(r.party_size)} أشخاص`, `${toAr(r.party_size)} guests`)}
                        </p>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-cream-100"
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

        {/* ===== التقييمات ===== */}
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-[color:var(--ink)]">
            {tr(lang, "تقييماته", "Their reviews")} <span className="text-sm font-bold text-[color:var(--muted)]">({toAr(reviews.length)})</span>
          </h2>
          {reviews.length === 0 ? (
            <div className="soft-card p-6 text-center text-sm text-[color:var(--muted)]">
              {tr(lang, "لم يقيّم بعد.", "No reviews yet.")}
            </div>
          ) : (
            <ul className="space-y-2">
              {reviews.map((rv) => (
                <li key={rv.id} className="soft-card p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-extrabold" style={{ color: "var(--brand-d)" }}>
                      {"★".repeat(rv.rating)}<span className="text-[color:var(--muted)]">{"★".repeat(Math.max(0, 5 - rv.rating))}</span>
                    </span>
                    <span className="shrink-0 text-xs text-[color:var(--muted)]">{fmtDateTime(rv.created_at, lang)}</span>
                  </div>
                  {rv.comment && <p className="mt-1.5 text-sm text-[color:var(--ink)]">{rv.comment}</p>}
                  {!rv.is_published && (
                    <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                      {tr(lang, "غير منشور", "Unpublished")}
                    </span>
                  )}
                </li>
              ))}
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
