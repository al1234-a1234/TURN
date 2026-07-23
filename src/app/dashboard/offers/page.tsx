import { redirect } from "next/navigation";
import { OwnerShell } from "../owner-shell";
import { loadOwner } from "../owner-context";
import { isModuleOn, staffHasPermission } from "@/lib/features";
import { createOffer, deleteOffer } from "./actions";
import { OfferToggle } from "./offer-toggle";
import { toAr, money } from "@/lib/format";
import { tr, type Lang } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import type { Database } from "@/lib/supabase/database.types";

type Offer = Database["public"]["Tables"]["offers"]["Row"];

const KIND_LABEL: Record<string, string> = {
  percent: "خصم نسبة",
  fixed: "خصم مبلغ",
  free_item: "صنف مجاني",
  bogo: "اشترِ واحصل",
  points: "نقاط مضاعفة",
};
const KIND_LABEL_EN: Record<string, string> = {
  percent: "Percent discount",
  fixed: "Amount off",
  free_item: "Free item",
  bogo: "Buy & get",
  points: "Bonus points",
};
const AUDIENCE_LABEL: Record<string, string> = {
  all: "كل العملاء",
  new: "العملاء الجدد",
  loyalty: "أعضاء الولاء",
  walkaway: "المنصرفون",
  slow_hours: "ساعات الركود",
};
const AUDIENCE_LABEL_EN: Record<string, string> = {
  all: "All customers",
  new: "New customers",
  loyalty: "Loyalty members",
  walkaway: "Walkaways",
  slow_hours: "Slow hours",
};

function offerValueText(o: Offer, lang: Lang): string {
  if (o.kind === "percent" && o.value != null) return `${toAr(o.value)}٪`;
  if (o.kind === "fixed" && o.value != null) return money(o.value);
  if (o.kind === "points" && o.value != null) return `×${toAr(o.value)}`;
  if (o.kind === "free_item") return tr(lang, "مجاني", "Free");
  if (o.kind === "bogo") return "1+1";
  return "—";
}

export default async function OffersPage() {
  const lang = await getLang();
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
          <Kpi label={tr(lang, "عروض نشطة", "Active offers")} value={toAr(activeCount)} tone="var(--st-open)" />
          <Kpi label={tr(lang, "إجمالي العروض", "Total offers")} value={toAr(list.length)} tone="var(--brand-d)" />
          <Kpi label={tr(lang, "مرات الاستخدام", "Redemptions")} value={toAr(totalRedeemed)} tone="var(--st-full)" />
        </div>

        {/* إنشاء عرض */}
        <section className="soft-card p-5">
          <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "عرض جديد", "New offer")}</h2>
          <p className="mb-4 text-sm text-[color:var(--muted)]">{tr(lang, "أنشئ خصمًا أو مكافأة تصل عملاءك مباشرةً داخل تطبيق دور.", "Create a discount or reward that reaches your customers directly in the Turn app.")}</p>
          <form action={createOffer} className="space-y-4">
            <div>
              <label className="field-label">{tr(lang, "عنوان العرض", "Offer title")}</label>
              <input name="title" required placeholder={tr(lang, "مثال: خصم 20٪ على الغداء", "e.g. 20% off lunch")} className={field} />
            </div>
            <div>
              <label className="field-label">{tr(lang, "الوصف (اختياري)", "Description (optional)")}</label>
              <textarea name="description" rows={2} placeholder={tr(lang, "تفاصيل العرض وشروطه…", "Offer details and terms…")} className={field} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">{tr(lang, "نوع العرض", "Offer type")}</label>
                <select name="kind" className={field} defaultValue="percent">
                  <option value="percent">{tr(lang, "خصم نسبة (٪)", "Percent discount (%)")}</option>
                  <option value="fixed">{tr(lang, "خصم مبلغ (ر.س)", "Amount off (SAR)")}</option>
                  <option value="free_item">{tr(lang, "صنف مجاني", "Free item")}</option>
                  <option value="bogo">{tr(lang, "اشترِ واحدًا واحصل على آخر", "Buy one, get one")}</option>
                  <option value="points">{tr(lang, "نقاط ولاء مضاعفة", "Double loyalty points")}</option>
                </select>
              </div>
              <div>
                <label className="field-label">{tr(lang, "القيمة", "Value")}</label>
                <input name="value" inputMode="numeric" placeholder="20" className={field} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">{tr(lang, "الفئة المستهدفة", "Target audience")}</label>
                <select name="audience" className={field} defaultValue="all">
                  <option value="all">{tr(lang, "كل العملاء", "All customers")}</option>
                  <option value="new">{tr(lang, "العملاء الجدد", "New customers")}</option>
                  <option value="loyalty">{tr(lang, "أعضاء الولاء", "Loyalty members")}</option>
                  <option value="walkaway">{tr(lang, "من غادر الطابور", "Those who left the queue")}</option>
                  <option value="slow_hours">{tr(lang, "ساعات الركود", "Slow hours")}</option>
                </select>
              </div>
              <div>
                <label className="field-label">{tr(lang, "رمز الخصم (اختياري)", "Discount code (optional)")}</label>
                <input name="code" placeholder="RAMADAN20" className={field} style={{ textTransform: "uppercase" }} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label">{tr(lang, "ينتهي في (اختياري)", "Ends on (optional)")}</label>
                <input type="date" name="ends_at" className={field} />
              </div>
              <div>
                <label className="field-label">{tr(lang, "سقف الاستخدام", "Usage cap")}</label>
                <input name="total_limit" inputMode="numeric" placeholder={tr(lang, "بلا حد", "No limit")} className={field} />
              </div>
              <div>
                <label className="field-label">{tr(lang, "لكل عميل", "Per customer")}</label>
                <input name="per_customer_limit" inputMode="numeric" defaultValue="1" className={field} />
              </div>
            </div>
            <button className="btn btn-primary w-full">{tr(lang, "نشر العرض", "Publish offer")}</button>
          </form>
        </section>

        {/* قائمة العروض */}
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "عروضك", "Your offers")}</h2>
          {list.length === 0 ? (
            <div className="soft-card py-10 text-center">
              <p className="text-2xl">🎁</p>
              <p className="mt-2 font-bold text-[color:var(--ink)]">{tr(lang, "لا توجد عروض بعد", "No offers yet")}</p>
              <p className="mt-1 text-sm text-[color:var(--muted)]">{tr(lang, "أنشئ أول عرض من الأعلى ليظهر لعملائك.", "Create your first offer above to show it to your customers.")}</p>
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
                      <span className="text-lg leading-none">{offerValueText(o, lang)}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-[color:var(--ink)]">{o.title}</p>
                      {o.description && <p className="mt-0.5 line-clamp-2 text-sm text-[color:var(--muted)]">{o.description}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="chip">{tr(lang, KIND_LABEL[o.kind], KIND_LABEL_EN[o.kind])}</span>
                        <span className="chip">{tr(lang, AUDIENCE_LABEL[o.audience] ?? o.audience, AUDIENCE_LABEL_EN[o.audience] ?? o.audience)}</span>
                        {o.code && <span className="chip" dir="ltr">{o.code}</span>}
                        <span className="text-xs text-[color:var(--muted)]">{tr(lang, `استُخدم ${toAr(o.redeemed_count)} مرة`, `Used ${toAr(o.redeemed_count)} times`)}</span>
                      </div>
                    </div>
                    <OfferToggle id={o.id} active={o.is_active} />
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--border)" }}>
                    <span className="text-xs text-[color:var(--muted)]">
                      {o.ends_at
                        ? tr(lang, `ينتهي ${new Date(o.ends_at).toLocaleDateString("ar-SA")}`, `Ends ${new Date(o.ends_at).toLocaleDateString("en-US")}`)
                        : tr(lang, "بلا تاريخ انتهاء", "No end date")}
                    </span>
                    <form action={deleteOffer}>
                      <input type="hidden" name="offer_id" value={o.id} />
                      <button className="rounded-lg px-2 py-1 text-xs font-bold text-[color:var(--muted)] transition hover:text-red-600">{tr(lang, "حذف", "Delete")}</button>
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
