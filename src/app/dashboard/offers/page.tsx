import { redirect } from "next/navigation";
import { OwnerShell } from "../owner-shell";
import { loadOwner } from "../owner-context";
import { isModuleOn, staffHasPermission } from "@/lib/features";
import { createOffer, deleteOffer } from "./actions";
import { OfferToggle } from "./offer-toggle";
import { toAr, money } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

type Offer = Database["public"]["Tables"]["offers"]["Row"];

const KIND_LABEL: Record<string, string> = {
  percent: "خصم نسبة",
  fixed: "خصم مبلغ",
  free_item: "صنف مجاني",
  bogo: "اشترِ واحصل",
  points: "نقاط مضاعفة",
};
const AUDIENCE_LABEL: Record<string, string> = {
  all: "كل العملاء",
  new: "العملاء الجدد",
  loyalty: "أعضاء الولاء",
  walkaway: "المنصرفون",
  slow_hours: "ساعات الركود",
};

function offerValueText(o: Offer): string {
  if (o.kind === "percent" && o.value != null) return `${toAr(o.value)}٪`;
  if (o.kind === "fixed" && o.value != null) return money(o.value);
  if (o.kind === "points" && o.value != null) return `×${toAr(o.value)}`;
  if (o.kind === "free_item") return "مجاني";
  if (o.kind === "bogo") return "1+1";
  return "—";
}

export default async function OffersPage() {
  const load = await loadOwner();
  if (load.state !== "ok") redirect("/dashboard");
  const { supabase, restaurant, modules, role, permissions } = load.ctx;

  // بوابة الموديول + الصلاحية
  if (!isModuleOn(modules, "offers") || !staffHasPermission(role, permissions, "offers")) {
    redirect("/dashboard");
  }

  const { data: offers } = await supabase
    .from("offers")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false });

  const list = (offers ?? []) as Offer[];
  const activeCount = list.filter((o) => o.is_active).length;
  const totalRedeemed = list.reduce((a, o) => a + o.redeemed_count, 0);

  const field = "field-input";

  return (
    <OwnerShell active="offers" restaurant={restaurant} modules={modules} role={role} permissions={permissions}>
      <div className="space-y-6">
        {/* مؤشرات */}
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="عروض نشطة" value={toAr(activeCount)} tone="var(--st-open)" />
          <Kpi label="إجمالي العروض" value={toAr(list.length)} tone="var(--brand-d)" />
          <Kpi label="مرات الاستخدام" value={toAr(totalRedeemed)} tone="var(--st-full)" />
        </div>

        {/* إنشاء عرض */}
        <section className="soft-card p-5">
          <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">عرض جديد</h2>
          <p className="mb-4 text-sm text-[color:var(--muted)]">أنشئ خصمًا أو مكافأة تصل عملاءك مباشرةً داخل تطبيق دور.</p>
          <form action={createOffer} className="space-y-4">
            <div>
              <label className="field-label">عنوان العرض</label>
              <input name="title" required placeholder="مثال: خصم ٢٠٪ على الغداء" className={field} />
            </div>
            <div>
              <label className="field-label">الوصف (اختياري)</label>
              <textarea name="description" rows={2} placeholder="تفاصيل العرض وشروطه…" className={field} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">نوع العرض</label>
                <select name="kind" className={field} defaultValue="percent">
                  <option value="percent">خصم نسبة (٪)</option>
                  <option value="fixed">خصم مبلغ (ر.س)</option>
                  <option value="free_item">صنف مجاني</option>
                  <option value="bogo">اشترِ واحدًا واحصل على آخر</option>
                  <option value="points">نقاط ولاء مضاعفة</option>
                </select>
              </div>
              <div>
                <label className="field-label">القيمة</label>
                <input name="value" inputMode="numeric" placeholder="٢٠" className={field} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">الفئة المستهدفة</label>
                <select name="audience" className={field} defaultValue="all">
                  <option value="all">كل العملاء</option>
                  <option value="new">العملاء الجدد</option>
                  <option value="loyalty">أعضاء الولاء</option>
                  <option value="walkaway">من غادر الطابور</option>
                  <option value="slow_hours">ساعات الركود</option>
                </select>
              </div>
              <div>
                <label className="field-label">رمز الخصم (اختياري)</label>
                <input name="code" placeholder="RAMADAN20" className={field} style={{ textTransform: "uppercase" }} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label">ينتهي في (اختياري)</label>
                <input type="date" name="ends_at" className={field} />
              </div>
              <div>
                <label className="field-label">سقف الاستخدام</label>
                <input name="total_limit" inputMode="numeric" placeholder="بلا حد" className={field} />
              </div>
              <div>
                <label className="field-label">لكل عميل</label>
                <input name="per_customer_limit" inputMode="numeric" defaultValue="١" className={field} />
              </div>
            </div>
            <button className="btn btn-primary w-full">نشر العرض</button>
          </form>
        </section>

        {/* قائمة العروض */}
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-[color:var(--ink)]">عروضك</h2>
          {list.length === 0 ? (
            <div className="soft-card py-10 text-center">
              <p className="text-2xl">🎁</p>
              <p className="mt-2 font-bold text-[color:var(--ink)]">لا توجد عروض بعد</p>
              <p className="mt-1 text-sm text-[color:var(--muted)]">أنشئ أول عرض من الأعلى ليظهر لعملائك.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {list.map((o) => (
                <li key={o.id} className="soft-card p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl font-display font-bold text-white"
                      style={{ background: o.is_active ? "linear-gradient(160deg,#a8371a,#661c0a)" : "var(--muted)" }}
                    >
                      <span className="text-lg leading-none">{offerValueText(o)}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-[color:var(--ink)]">{o.title}</p>
                      {o.description && <p className="mt-0.5 line-clamp-2 text-sm text-[color:var(--muted)]">{o.description}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="chip">{KIND_LABEL[o.kind]}</span>
                        <span className="chip">{AUDIENCE_LABEL[o.audience] ?? o.audience}</span>
                        {o.code && <span className="chip" dir="ltr">{o.code}</span>}
                        <span className="text-xs text-[color:var(--muted)]">استُخدم {toAr(o.redeemed_count)} مرة</span>
                      </div>
                    </div>
                    <OfferToggle id={o.id} active={o.is_active} />
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--border)" }}>
                    <span className="text-xs text-[color:var(--muted)]">
                      {o.ends_at ? `ينتهي ${new Date(o.ends_at).toLocaleDateString("ar-SA")}` : "بلا تاريخ انتهاء"}
                    </span>
                    <form action={deleteOffer}>
                      <input type="hidden" name="offer_id" value={o.id} />
                      <button className="rounded-lg px-2 py-1 text-xs font-bold text-[color:var(--muted)] transition hover:text-red-600">حذف</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
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
