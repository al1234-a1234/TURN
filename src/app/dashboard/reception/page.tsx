import Link from "next/link";
import { redirect } from "next/navigation";
import { QueueActions } from "../queue-actions";
import { WalkInForm } from "./walkin-form";
import { RewardBox } from "./reward-box";
import { AutoRefresh } from "./auto-refresh";
import { BranchTabs } from "./branch-tabs";
import { StatusToggle } from "./status-toggle";
import { ReservationActions } from "../reservations/reservation-actions";
import { loadOwner, scopeBranchIds } from "../owner-context";
import { staffHasPermission } from "@/lib/features";
import { toAr } from "@/lib/format";
import { tr, type Lang } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { riyadhDayStart, isWithinOpeningHours } from "@/lib/dates";
import { zoneLabel } from "@/lib/zones";

/** الأقسام مفتوحة العدد، فاللون يدور بدل أن يُثبَّت لاثنين. */
const ZONE_TONES = ["var(--brand-d)", "var(--brand)", "var(--st-open)", "var(--st-full)"];

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

  const { data: branches, error: branchesError } = await supabase
    .from("branches").select("id, name, city").eq("restaurant_id", restaurant.id).eq("is_active", true).order("created_at");
  // «لا يوجد فرع نشِط» عند فشل الجلب تهمة للمالك بأنه لم يُنشئ فرعًا — نفصلها
  if (branchesError) {
    console.error("[reception] branches:", restaurant.id, branchesError.message);
    return <LoadError lang={lang} />;
  }
  // عزل الفرانشايز: حساب مربوط بفرع يرى فرعه فقط (بلا تبويبات)؛ غير المربوط يرى الكل
  const scopedIds = new Set(scopeBranchIds(load.ctx, (branches ?? []).map((b) => b.id)));
  const branchList = (branches ?? []).filter((b) => scopedIds.has(b.id));
  const multi = branchList.length > 1;

  // فرع مختار — كل فرع قسم مستقل تمامًا (نمط ريكيو). الاستقبال يعمل على فرع واحد فقط.
  const requested = (await searchParams).branch;
  const activeBranch =
    branchList.find((b) => b.id === requested) ?? branchList[0] ?? null;

  const startToday = riyadhDayStart().toISOString();

  // الحجوزات القريبة: نافذة ٤ ساعات قادمة وساعة مضت. الحجز ليس منافسًا للطابور
  // بل هو الطابور مقلوبًا — دورٌ حُدّد وقته سلفًا. وفصلهما في شاشتين كان يجعل
  // المضيف يُجلس واقفًا على طاولةٍ محجوزة بعد ربع ساعة.
  const soonFrom = new Date(Date.now() - 60 * 60e3).toISOString();
  const soonTo = new Date(Date.now() + 4 * 3600e3).toISOString();

  const [queueRes, todayRes, statusRes, resvRes] = activeBranch
    ? await Promise.all([
        // نداءٌ واحد بدل انضمامٍ تحرسه سياسةُ `customers` صفًّا صفًّا: كانت
        // الحراسة تنادي دالّةً أمنيّة لكلّ منتظر، فبلغت القراءة ٢٥٠ مللي على
        // فرعٍ فيه ٢٩٦ منتظرًا — والدالّة تسأل السؤال مرّةً وتقرأ (0102).
        // الحيّ بالحالة فقط — فلتر «يوم الرياض» كان يبخّر طابور ما بعد منتصف
        // الليل من الشاشة؛ الصفوف المنسية يقتلها تقادم الـ٨ ساعات (0057)
        supabase.rpc("staff_branch_queue", { p_branch_id: activeBranch.id }),
        supabase.from("waitlist_entries").select("id", { count: "exact", head: true })
          .eq("branch_id", activeBranch.id).eq("status", "seated").gte("seated_at", startToday),
        supabase.from("branch_settings").select("manually_closed, busy_now, opening_hours, accepts_reservations").eq("branch_id", activeBranch.id).maybeSingle(),
        supabase
          .from("reservations")
          .select("id, reserved_at, party_size, status, notes, customers(full_name, phone), tables(label, zone)")
          .eq("branch_id", activeBranch.id)
          .in("status", ["pending", "confirmed"])
          .gte("reserved_at", soonFrom)
          .lte("reserved_at", soonTo)
          .order("reserved_at"),
      ])
    : [{ data: [], error: null }, { count: 0, error: null }, { data: null, error: null }, { data: [], error: null }];

  // أخطر كذبة في الشاشة: طابور فارغ. الموظّف يقرأه «لا أحد ينتظر» فيتوقّف عن
  // المناداة والناس واقفون. عند فشل الجلب نقول تعذّر التحميل ولا نرسم طابورًا.
  const { data: queue, error: queueError } = queueRes;
  if (queueError) {
    console.error("[reception] staff_branch_queue:", activeBranch?.id, queueError.message);
    return <LoadError lang={lang} />;
  }
  // فشل عدّاد «خدمناهم اليوم» لا يعطّل الشاشة — لكن لا نعرض صفرًا مكذوبًا (٠ أسفل)
  if (todayRes?.error) console.error("[reception] served-today count:", activeBranch?.id, todayRes.error.message);
  if (statusRes?.error) console.error("[reception] branch_settings:", activeBranch?.id, statusRes.error.message);

  // الدالّة تُرجع الاسم والهاتف مسطَّحَين؛ والبطاقات تقرأ `customers` منذ
  // أوّل يوم. فنُعيد التشكيل هنا في سطرٍ واحد بدل تعديل كلّ موضع عرض.
  const list = (queue ?? []).map((q) => ({ ...q, customers: { full_name: q.full_name, phone: q.phone } }));

  // شارة الهدية على بطاقة الدور أُزيلت بقرار المالك (تنظيف الملصقات). واعتماد
  // الهدية يبقى كاملًا في صندوق «اعتمد هدية» بالبحث بالرقم — وهو المسار الذي
  // يُقفل الهدية في القاعدة. فالمحذوف عرضٌ لا وظيفة.
  // (دالة reception_armed_gifts باقية في القاعدة لمن يعيدها لاحقًا.)



  // أقسام هذا الفرع بأسماء المالك. الاستقبال لا يعرض عمودًا لقسمٍ لا يملكه
  // المطعم — لكن عمودًا فيه أدوارٌ قائمة يبقى معروضًا ولو أُطفئ القسم بعد
  // انضمامها: من وقف في الطابور لا يختفي لأن المالك غيّر إعدادًا.
  const { data: zoneRows } = activeBranch
    ? await supabase.from("branch_zones").select("id, key, name, name_en, sort_order, is_active")
        .eq("branch_id", activeBranch.id).order("sort_order")
    : { data: [] };
  const zones = (zoneRows ?? []) as { id: string; key: string; name: string; name_en: string | null; sort_order: number; is_active: boolean }[];
  const rowsOf = (key: string) => list.filter((q) => q.zone === key);
  const shownZones = zones.filter((z) => z.is_active || rowsOf(z.key).length > 0);
  // أدوارٌ بمفتاحٍ لا قسمَ له (بياناتٌ قديمة) لا تختفي من شاشة المضيف
  const other = list.filter((q) => !zones.some((z) => z.key === q.zone));
  const activeZones = zones.filter((z) => z.is_active);
  const servedToday = todayRes?.count ?? 0;
  const status = statusRes?.data as { manually_closed: boolean; busy_now: boolean; opening_hours: { open?: string; close?: string } | null; accepts_reservations?: boolean } | null;
  const closedByHours = status ? !isWithinOpeningHours(status.opening_hours) : false;

  // فشل جلب الحجوزات لا يُفرغ الشاشة، لكنه لا يُقرأ «لا حجوزات» أيضًا
  if (resvRes?.error) console.error("[reception] reservations:", activeBranch?.id, resvRes.error.message);
  type ResvRow = {
    id: string;
    reserved_at: string;
    party_size: number;
    status: string;
    notes: string | null;
    customers: { full_name: string; phone: string } | { full_name: string; phone: string }[] | null;
    tables: { label: string; zone: string | null } | { label: string; zone: string | null }[] | null;
  };
  const upcoming = ((resvRes?.data ?? []) as ResvRow[]);
  // مضيفٌ بلا صلاحية الحجوزات: نُخفي القسم كلّه بدل أن نعرض أزرارًا يضغطها
  // فلا تفعل شيئًا — الإجراء نفسه يتطلّب الصلاحية على الخادم.
  const canManageReservations = staffHasPermission(role, permissions, "reservations");
  const showReservations = canManageReservations && ((status?.accepts_reservations ?? false) || upcoming.length > 0);

  type Row = (typeof list)[number];
  // rank = الترتيب الحيّ داخل القسم (1،2،3…) لا الرقم المخزَّن — ينضغط عند الإجلاس
  const Card = ({ q, rank }: { q: Row; rank: number }) => {
    const cust = Array.isArray(q.customers) ? q.customers[0] : q.customers;
    const waited = minutesSince(q.joined_at);
    return (
      <li className="soft-card flex items-center gap-3 p-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-xl font-bold text-cream-100" style={{ background: "var(--brand-solid)" }}>
          {toAr(rank)}
        </span>
        <div className="min-w-0 flex-1">
          {/* خطّ دائم لا عند التحويم فقط: الاستقبال يعمل على جوال/آيباد بلا مؤشّر،
              فما كان أحد يعرف أن اسم العميل يفتح ملفّه */}
          {canViewCustomers ? (
            <Link href={`/dashboard/customers/${q.customer_id}`}
              className="inline-flex max-w-full items-center gap-1 truncate font-bold text-brand-700 underline decoration-brand-700/40 decoration-2 underline-offset-4">
              <span className="truncate">{cust?.full_name ?? tr(lang, "عميل", "Customer")}</span>
              <span aria-hidden className="shrink-0 text-[11px] opacity-70">↗</span>
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
              style={{ background: "var(--surface-2)", border: "1px solid rgba(102,28,10,0.14)", color: q.distance_m > 5000 ? "var(--muted)" : "var(--brand-d)" }}>
              📍 {tr(lang,
                    q.distance_m >= 1000 ? `يبعد ${(q.distance_m / 1000).toFixed(1)} كم` : `يبعد ${q.distance_m} م`,
                    q.distance_m >= 1000 ? `${(q.distance_m / 1000).toFixed(1)} km away` : `${q.distance_m} m away`)}
            </span>
          )}
          {q.confirmed_at && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold"
              style={{ background: "var(--brand-solid)", color: "var(--brand-ink)" }}>
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
      {/* تحديث ذكي: نبضة خفيفة، وريندر كامل فقط عند تغيّر الطابور */}
      {activeBranch && <AutoRefresh branchId={activeBranch.id} intervalMs={10_000} />}

      <div className="mb-5 hidden items-center justify-between lg:flex">
        <div>
          <h1 className="font-display text-3xl font-bold text-[color:var(--ink)]">{tr(lang, "الاستقبال", "Reception")}</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "الطابور الحيّ — إجلاس، تنبيه، وإدارة", "Live queue — seat, notify, and manage")}</p>
        </div>
        {activeBranch && (
          <a href={`/tv/${activeBranch.id}`} target="_blank" rel="noreferrer"
             className="rounded-2xl px-4 py-2.5 text-sm font-extrabold text-cream-100"
             style={{ background: "var(--brand-solid)" }}>
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
          {status && (
            <StatusToggle
              branchId={activeBranch.id}
              closedNow={status.manually_closed}
              busyNow={status.busy_now}
              closedByHours={closedByHours}
            />
          )}

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={tr(lang, "في الطابور الآن", "In queue now")} value={toAr(list.length)} tone="var(--brand-d)" />
            {/* عدّاد لكل قسم — بأسماء المالك. أكثر من قسمين يزدحمان في صفّ
                المؤشّرات، فيكفيه إجمالي الطابور والأعمدة تحته تفصّله. */}
            {shownZones.length <= 2 && shownZones.map((z, i) => (
              <Stat key={z.id} label={zoneLabel({ key: z.key, name: z.name, nameEn: z.name_en }, lang)}
                    value={toAr(rowsOf(z.key).length)} tone={ZONE_TONES[i % ZONE_TONES.length]} />
            ))}
            {/* شرطة بدل صفرٍ كاذب: «خدمنا ٠ اليوم» رقمٌ يُبنى عليه قرار، لا فراغ */}
            <Stat label={tr(lang, "خدمناهم اليوم", "Served today")} value={todayRes?.error ? "—" : toAr(servedToday)} tone="var(--brand)" />
          </div>

          {/* ===== القادمون بحجز ===== */}
          {showReservations && (
            <section className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display text-lg font-bold text-[color:var(--ink)]">
                  <span className="h-4 w-1.5 rounded-full" style={{ background: "var(--st-full)" }} />
                  {tr(lang, "قادمون بحجز", "Arriving by reservation")}
                </h3>
                <Link href={`/dashboard/reservations${activeBranch ? `?branch=${activeBranch.id}` : ""}`}
                      className="text-xs font-bold text-brand-700 underline decoration-2 underline-offset-4">
                  {tr(lang, "كل الحجوزات ←", "All reservations ←")}
                </Link>
              </div>
              {upcoming.length === 0 ? (
                <div className="soft-card py-6 text-center text-sm text-[color:var(--muted)]">
                  {tr(lang, "لا حجوزات في الأربع ساعات القادمة", "No reservations in the next four hours")}
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {upcoming.map((r) => {
                    const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers;
                    const tbl = Array.isArray(r.tables) ? r.tables[0] : r.tables;
                    const mins = Math.round((new Date(r.reserved_at).getTime() - Date.now()) / 60000);
                    // «متأخّر» ليس ملاحظة: الطاولة محجوزة له وهي فارغة الآن،
                    // والمضيف يقرّر إن كان يفرج عنها أم ينتظر.
                    const late = mins < 0;
                    return (
                      <li key={r.id} className="soft-card flex items-center gap-3 p-3.5">
                        <span className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-2xl tabular-nums"
                              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: late ? "var(--danger)" : "var(--brand-d)" }}>
                          <span className="font-display text-base font-bold leading-none">
                            {new Date(r.reserved_at).toLocaleTimeString(lang === "en" ? "en-US" : "ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" })}
                          </span>
                          <span className="mt-0.5 text-[10px] font-bold">
                            {late
                              ? tr(lang, `تأخّر ${toAr(-mins)}د`, `${-mins}m late`)
                              : tr(lang, `بعد ${toAr(mins)}د`, `in ${mins}m`)}
                          </span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold text-[color:var(--ink)]">{cust?.full_name ?? tr(lang, "عميل", "Customer")}</p>
                          <p className="text-sm text-[color:var(--muted)]" dir="ltr">{cust?.phone ?? "—"}</p>
                          <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                            {toAr(r.party_size)} {tr(lang, "أشخاص", "guests")}
                            {tbl ? ` · ${tr(lang, `طاولة ${tbl.label}`, `table ${tbl.label}`)}` : ` · ${tr(lang, "بلا طاولة", "no table")}`}
                          </p>
                          {r.notes && <p className="mt-1 truncate text-xs text-[color:var(--ink)]">📝 {r.notes}</p>}
                        </div>
                        <ReservationActions id={r.id} status={r.status} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          <RewardBox />

          <WalkInForm
            branchId={activeBranch.id}
            branchName={multi ? activeBranch.name : undefined}
            zones={activeZones.map((z) => ({ key: z.key, name: z.name, nameEn: z.name_en }))}
          />

          <div className={shownZones.length > 1 ? "grid gap-6 sm:grid-cols-2" : "grid gap-6"}>
            {shownZones.map((z, i) => (
              <ZoneColumn
                key={z.id}
                title={zoneLabel({ key: z.key, name: z.name, nameEn: z.name_en }, lang)}
                rows={rowsOf(z.key)}
                tone={ZONE_TONES[i % ZONE_TONES.length]}
              />
            ))}
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

/**
 * رسالة فشل الجلب — تُقال حين نجهل الحقيقة، لا حين نعرف أن لا شيء هناك.
 * فصلها عن «لا أحد بالانتظار» يمنع الموظّف من التصرّف بناءً على فراغٍ كاذب.
 */
function LoadError({ lang }: { lang: Lang }) {
  return (
    <div className="soft-card py-12 text-center">
      <p className="text-sm font-bold text-[color:var(--ink)]">{tr(lang, "تعذّر التحميل — حدّث الصفحة.", "Couldn’t load — refresh the page.")}</p>
      <p className="mt-1 text-xs text-[color:var(--muted)]">{tr(lang, "لم نستطع قراءة البيانات؛ هذه ليست شاشة فارغة.", "We couldn’t read the data; this is not an empty screen.")}</p>
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
