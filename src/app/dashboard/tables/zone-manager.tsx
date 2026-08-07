import { addZone, renameZone, setZoneActive, moveZone } from "./actions";
import { tr, type Lang } from "@/lib/i18n";
import { toAr } from "@/lib/format";

export type ZoneRow = {
  id: string;
  key: string;
  name: string;
  name_en: string | null;
  sort_order: number;
  is_active: boolean;
};

/**
 * أقسام الفرع — يعرّفها المالك بنفسه.
 *
 * كانت مربّعَي اختيار: «داخلي» و«خارجي». فمطعمٌ عنده «عوائل» و«أفراد» —
 * وهو أشيع تقسيمٍ في مطاعم السعودية — لم يكن يستطيع تمثيله أصلًا، فيضطرّ
 * أن يسمّي قسم العوائل «داخلي» ويكذب على عميله.
 *
 * والمفتاح التقنيّ (`key`) لا يُعرض ولا يُطلب: يُولَّد مرّةً ويثبت. إعادة
 * تسمية «خارجي» إلى «التراس» تغيّر ما يقرؤه العميل ولا تيتّم طاولةً واحدة.
 */
export function ZoneManager({
  zones,
  branchId,
  lang,
  tableCounts,
}: {
  zones: ZoneRow[];
  branchId: string;
  lang: Lang;
  /** عدد الطاولات في كل قسم — الإطفاء قرارٌ يحتاج أن يعرف ما يسحبه */
  tableCounts: Record<string, number>;
}) {
  const activeCount = zones.filter((z) => z.is_active).length;

  return (
    <section className="soft-card mb-6 p-5">
      <h2 className="mb-1 font-display text-lg font-bold text-[color:var(--ink)]">
        {tr(lang, "أقسام الجلوس", "Seating areas")}
      </h2>
      <p className="mb-4 text-xs font-bold text-[color:var(--muted)]">
        {tr(
          lang,
          "سمِّها كما تسمّيها في مطعمك — عوائل، أفراد، تراس، ميزانين. يراها العميل كما كتبتها.",
          "Name them as you do in your restaurant — families, singles, terrace, mezzanine. Customers see exactly what you write.",
        )}
      </p>

      {zones.length > 0 && (
        <ul className="mb-4 space-y-2">
          {zones.map((z, i) => {
            const n = tableCounts[z.key] ?? 0;
            // آخر قسمٍ فعّال لا يُطفأ: فرعٌ بلا قسمٍ واحد لا يستقبل دورًا ولا حجزًا
            const lastActive = z.is_active && activeCount <= 1;
            return (
              <li
                key={z.id}
                className={`rounded-2xl border p-3${z.is_active ? "" : " opacity-60"}`}
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <form action={moveZone}>
                      <input type="hidden" name="zone_id" value={z.id} />
                      <input type="hidden" name="dir" value="up" />
                      <button disabled={i === 0} className="grid h-5 w-6 place-items-center rounded text-[color:var(--muted)] disabled:opacity-25" aria-label={tr(lang, "أعلى", "Up")}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </form>
                    <form action={moveZone}>
                      <input type="hidden" name="zone_id" value={z.id} />
                      <input type="hidden" name="dir" value="down" />
                      <button disabled={i === zones.length - 1} className="grid h-5 w-6 place-items-center rounded text-[color:var(--muted)] disabled:opacity-25" aria-label={tr(lang, "أسفل", "Down")}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </form>
                  </div>

                  <form action={renameZone} className="flex min-w-0 flex-1 items-center gap-2">
                    <input type="hidden" name="zone_id" value={z.id} />
                    <input name="name" defaultValue={z.name} className="field-input min-w-0 flex-1" aria-label={tr(lang, "اسم القسم", "Area name")} />
                    <input name="name_en" defaultValue={z.name_en ?? ""} dir="ltr" placeholder="English" className="field-input hidden min-w-0 flex-1 sm:block" />
                    <button className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--brand-d)" }}>
                      {tr(lang, "حفظ", "Save")}
                    </button>
                  </form>

                  <form action={setZoneActive} className="shrink-0">
                    <input type="hidden" name="zone_id" value={z.id} />
                    <input type="hidden" name="active" value={z.is_active ? "false" : "true"} />
                    <button
                      disabled={lastActive}
                      className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-40"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: z.is_active ? "var(--muted)" : "var(--st-open)" }}
                      title={lastActive ? tr(lang, "لا يمكن إطفاء آخر قسم", "Can't turn off the last area") : undefined}
                    >
                      {z.is_active ? tr(lang, "إطفاء", "Turn off") : tr(lang, "تشغيل", "Turn on")}
                    </button>
                  </form>
                </div>

                <p className="mt-1.5 ps-8 text-[11px] font-bold text-[color:var(--muted)]">
                  {n > 0
                    ? tr(lang, `${toAr(n)} طاولة`, `${n} table${n === 1 ? "" : "s"}`)
                    : tr(lang, "بلا طاولات", "No tables")}
                  {!z.is_active && (
                    <span style={{ color: "var(--danger)" }}>
                      {" · "}
                      {tr(lang, "مُطفأ — لا يُعرض للعميل ولا تُحجز طاولاته", "Off — hidden from customers, its tables aren't bookable")}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <form action={addZone} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="branch_id" value={branchId} />
        <input name="name" required placeholder={tr(lang, "اسم القسم — مثل: عوائل", "Area name — e.g. Families")} className="field-input" />
        <input name="name_en" dir="ltr" placeholder={tr(lang, "بالإنجليزية (اختياري)", "In English (optional)")} className="field-input" />
        <button className="btn btn-primary">{tr(lang, "إضافة قسم", "Add area")}</button>
      </form>
    </section>
  );
}
