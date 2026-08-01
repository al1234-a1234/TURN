"use client";

import { useState } from "react";
import { saveCheckinSettings } from "./actions";
import { toAr } from "@/lib/format";
import { tr, type Lang } from "@/lib/i18n";

/**
 * «ماذا يفعل الباركود؟» — تحكّم المالك الكامل في سلوك المسح.
 *
 * القوالب لا تكتب في القاعدة: تعبّئ النموذج فقط، والمالك يراجع ثم يضغط
 * «حفظ» بنفسه. هكذا تُشحن المكتبة «جاهزة لكن مطفأة» حرفيًّا — لا مفاجآت،
 * ولا زر يفعّل مالًا (الهدية مال) دون مراجعة.
 */

export type ScanRules = {
  scan_hourly_limit: number;
  welcome_enabled: boolean;
  welcome_kind: string;
  welcome_title: string;
  welcome_value: number | null;
  welcome_value_kind: string;
  welcome_expires_days: number;
  instant_enabled: boolean;
  instant_kind: string;
  instant_title: string;
  instant_value: number | null;
  instant_value_kind: string;
  instant_expires_days: number;
  preset_key: string | null;
};

type Preset = {
  key: string;
  icon: string;
  ar: string; en: string;
  descAr: string; descEn: string;
  rules: Partial<ScanRules>;
};

const PRESETS: Preset[] = [
  {
    key: "welcome_only", icon: "🎁",
    ar: "هدية ترحيب", en: "Welcome gift",
    descAr: "أول مسح فقط: خصم ٢٠٪ يجذب العميل الجديد ويأخذ رقمه",
    descEn: "First scan only: 20% off wins the new customer and their number",
    rules: {
      welcome_enabled: true, welcome_kind: "discount", welcome_title: "خصم ترحيب ٢٠٪",
      welcome_value: 20, welcome_value_kind: "percent", welcome_expires_days: 14,
      instant_enabled: false,
    },
  },
  {
    key: "instant_every_scan", icon: "⚡",
    ar: "خصم كل مسح", en: "Discount every scan",
    descAr: "كل زيارة: خصم ١٠٪ صالح يومه — السبب اللي يخلّيه يمسح كل مرّة",
    descEn: "Every visit: 10% off valid today — the reason to scan every time",
    rules: {
      instant_enabled: true, instant_kind: "discount", instant_title: "خصم المسح ١٠٪",
      instant_value: 10, instant_value_kind: "percent", instant_expires_days: 1,
      welcome_enabled: false,
    },
  },
  {
    key: "both", icon: "👑",
    ar: "الاثنان معًا", en: "Both together",
    descAr: "ترحيب ٢٠٪ للجديد + ٥٪ فوري لكل مسح بعده",
    descEn: "20% welcome for new customers + 5% instant on every later scan",
    rules: {
      welcome_enabled: true, welcome_kind: "discount", welcome_title: "خصم ترحيب ٢٠٪",
      welcome_value: 20, welcome_value_kind: "percent", welcome_expires_days: 14,
      instant_enabled: true, instant_kind: "discount", instant_title: "خصم المسح ٥٪",
      instant_value: 5, instant_value_kind: "percent", instant_expires_days: 1,
    },
  },
  {
    key: "silent", icon: "🤫",
    ar: "تسجيل صامت", en: "Silent check-in",
    descAr: "بلا هدايا: المسح يبني قاعدة عملائك ونقاط الولاء فقط",
    descEn: "No gifts: scans build your customer base and loyalty points only",
    rules: { welcome_enabled: false, instant_enabled: false },
  },
];

export function ScanRulesForm({ initial, branchId, lang }: { initial: ScanRules; branchId: string; lang: Lang }) {
  const [r, setR] = useState<ScanRules>(initial);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const set = (patch: Partial<ScanRules>) => { setR((p) => ({ ...p, ...patch })); setSaved(false); };

  const field = "field-input";

  return (
    <form
      action={async (fd) => { const ok = await saveCheckinSettings(fd); setSaved(ok); setSaveErr(!ok); }}
      className="space-y-5"
    >
      <input type="hidden" name="branch_id" value={branchId} />
      <input type="hidden" name="preset_key" value={r.preset_key ?? ""} />

      {/* ── مكتبة القوالب: تعبّئ النموذج ولا تحفظ شيئًا ── */}
      <div>
        <p className="mb-2 text-sm font-bold text-[color:var(--ink)]">{tr(lang, "ابدأ من قالب جاهز", "Start from a preset")}</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => set({ ...p.rules, preset_key: p.key })}
              className="rounded-2xl border p-3 text-start transition active:scale-[0.98]"
              style={{
                borderColor: r.preset_key === p.key ? "var(--brand-d)" : "var(--border)",
                background: r.preset_key === p.key ? "rgba(102,28,10,0.06)" : "var(--surface-2)",
              }}
            >
              <span className="block text-lg">{p.icon}</span>
              <span className="mt-1 block text-[13px] font-extrabold text-[color:var(--ink)]">{tr(lang, p.ar, p.en)}</span>
              <span className="mt-0.5 block text-[11px] font-medium leading-4 text-[color:var(--muted)]">{tr(lang, p.descAr, p.descEn)}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] font-medium text-[color:var(--muted)]">
          {tr(lang, "القالب يعبّئ الحقول فقط — لا يُحفظ شيء حتى تضغط «حفظ». عدّل ما شئت بعده.",
                   "Presets only fill the fields — nothing is saved until you press Save. Edit freely after.")}
        </p>
      </div>

      {/* ── ١) هدية الترحيب: أول مسح ── */}
      <RuleCard
        title={tr(lang, "هدية الترحيب — أول مسح", "Welcome gift — first scan")}
        sub={tr(lang, "تُمنح مرّة واحدة لكل عميل جديد. سبب يعطيك رقمه.", "Granted once per new customer. The reason they give you their number.")}
        enabled={r.welcome_enabled}
        onToggle={(v) => set({ welcome_enabled: v, preset_key: null })}
        name="welcome_enabled"
      >
        <div>
          <label className="field-label">{tr(lang, "عنوان الهدية", "Gift title")}</label>
          <input name="welcome_title" value={r.welcome_title}
                 onChange={(e) => set({ welcome_title: e.target.value, preset_key: null })}
                 placeholder={tr(lang, "مثال: خصم ترحيب ٢٠٪", "e.g. 20% welcome discount")} className={field} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="field-label">{tr(lang, "النوع", "Type")}</label>
            <select name="welcome_kind" value={r.welcome_kind} onChange={(e) => set({ welcome_kind: e.target.value, preset_key: null })} className={field}>
              <option value="discount">{tr(lang, "خصم", "Discount")}</option>
              <option value="gift">{tr(lang, "هديّة", "Gift")}</option>
            </select>
          </div>
          <div>
            <label className="field-label">{tr(lang, "القيمة", "Value")}</label>
            <input name="welcome_value" inputMode="numeric" value={r.welcome_value != null ? toAr(r.welcome_value) : ""}
                   onChange={(e) => { const d = e.target.value.replace(/[٠-٩]/g, (x) => String("٠١٢٣٤٥٦٧٨٩".indexOf(x))).replace(/\D/g, ""); set({ welcome_value: d ? Number(d) : null, preset_key: null }); }}
                   placeholder={tr(lang, "٢٠", "20")} className={field} />
          </div>
          <div>
            <label className="field-label">{tr(lang, "الوحدة", "Unit")}</label>
            <select name="welcome_value_kind" value={r.welcome_value_kind} onChange={(e) => set({ welcome_value_kind: e.target.value, preset_key: null })} className={field}>
              <option value="percent">{tr(lang, "٪ نسبة", "% percent")}</option>
              <option value="amount">{tr(lang, "ر.س مبلغ", "SAR amount")}</option>
            </select>
          </div>
        </div>
        <div>
          <label className="field-label">{tr(lang, "صلاحية الهدية (أيام)", "Validity (days)")}</label>
          <input name="welcome_expires_days" inputMode="numeric" value={toAr(r.welcome_expires_days)}
                 onChange={(e) => { const d = e.target.value.replace(/[٠-٩]/g, (x) => String("٠١٢٣٤٥٦٧٨٩".indexOf(x))).replace(/\D/g, ""); set({ welcome_expires_days: d ? Number(d) : 14, preset_key: null }); }}
                 className={field} />
        </div>
      </RuleCard>

      {/* ── ٢) المكافأة الفورية: كل مسح ── */}
      <RuleCard
        title={tr(lang, "مكافأة فورية — كل مسح", "Instant reward — every scan")}
        sub={tr(lang, "تُمنح مع كل زيارة (بحدّ زيارة كل ٤ ساعات). السبب اللي يخلّيه يمسح كل مرّة.", "Granted on every visit (max one per 4 hours). The reason to scan every time.")}
        enabled={r.instant_enabled}
        onToggle={(v) => set({ instant_enabled: v, preset_key: null })}
        name="instant_enabled"
      >
        <div>
          <label className="field-label">{tr(lang, "عنوان المكافأة", "Reward title")}</label>
          <input name="instant_title" value={r.instant_title}
                 onChange={(e) => set({ instant_title: e.target.value, preset_key: null })}
                 placeholder={tr(lang, "مثال: خصم المسح ١٠٪", "e.g. 10% scan discount")} className={field} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="field-label">{tr(lang, "النوع", "Type")}</label>
            <select name="instant_kind" value={r.instant_kind} onChange={(e) => set({ instant_kind: e.target.value, preset_key: null })} className={field}>
              <option value="discount">{tr(lang, "خصم", "Discount")}</option>
              <option value="gift">{tr(lang, "هديّة", "Gift")}</option>
            </select>
          </div>
          <div>
            <label className="field-label">{tr(lang, "القيمة", "Value")}</label>
            <input name="instant_value" inputMode="numeric" value={r.instant_value != null ? toAr(r.instant_value) : ""}
                   onChange={(e) => { const d = e.target.value.replace(/[٠-٩]/g, (x) => String("٠١٢٣٤٥٦٧٨٩".indexOf(x))).replace(/\D/g, ""); set({ instant_value: d ? Number(d) : null, preset_key: null }); }}
                   placeholder={tr(lang, "١٠", "10")} className={field} />
          </div>
          <div>
            <label className="field-label">{tr(lang, "الوحدة", "Unit")}</label>
            <select name="instant_value_kind" value={r.instant_value_kind} onChange={(e) => set({ instant_value_kind: e.target.value, preset_key: null })} className={field}>
              <option value="percent">{tr(lang, "٪ نسبة", "% percent")}</option>
              <option value="amount">{tr(lang, "ر.س مبلغ", "SAR amount")}</option>
            </select>
          </div>
        </div>
        <div>
          <label className="field-label">{tr(lang, "صلاحية المكافأة (أيام)", "Validity (days)")}</label>
          <input name="instant_expires_days" inputMode="numeric" value={toAr(r.instant_expires_days)}
                 onChange={(e) => { const d = e.target.value.replace(/[٠-٩]/g, (x) => String("٠١٢٣٤٥٦٧٨٩".indexOf(x))).replace(/\D/g, ""); set({ instant_expires_days: d ? Number(d) : 1, preset_key: null }); }}
                 className={field} />
          <p className="mt-1 text-[11px] font-medium text-[color:var(--muted)]">
            {tr(lang, "يوم واحد = «استخدمه في زيارتك هذه» — الأقوى لإرجاعه بكرة.", "1 day = “use it this visit” — strongest for bringing them back.")}
          </p>
        </div>
      </RuleCard>

      {/* درع الإغراق — إعداد تشغيلي، يُرفع للفروع الكبيرة */}
      <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
        <label className="field-label">{tr(lang, "أقصى مسحات بالساعة لهذا الفرع", "Max scans per hour for this branch")}</label>
        <input name="scan_hourly_limit" inputMode="numeric" value={toAr(r.scan_hourly_limit)}
               onChange={(e) => { const d = e.target.value.replace(/[٠-٩]/g, (x) => String("٠١٢٣٤٥٦٧٨٩".indexOf(x))).replace(/\D/g, ""); set({ scan_hourly_limit: d ? Number(d) : 120 }); }}
               className={field} />
        <p className="mt-1 text-[11px] font-medium text-[color:var(--muted)]">
          {tr(lang, "درع ضد الإغراق. الافتراضي ١٢٠ يكفي أغلب الفروع — ارفعه لو فرعك يستقبل مئات العملاء بالليلة.",
                   "Flood shield. The default 120 suits most branches — raise it if yours serves hundreds a night.")}
        </p>
      </div>

      <button className="btn btn-primary w-full">{tr(lang, "حفظ قواعد المسح", "Save scan rules")}</button>
      {saveErr && (
        <p className="rounded-xl px-3 py-2 text-sm font-bold text-[color:var(--danger)]" style={{ background: "rgba(200,70,70,0.08)" }}>تعذّر الحفظ — تأكد من صلاحيتك وحاول ثانية</p>
      )}
      {saved && (
        <p className="text-center text-sm font-bold" style={{ color: "var(--brand-d)" }}>
          {tr(lang, "انحفظت ✓ — الباركود الآن يطبّق هذه القواعد", "Saved ✓ — the barcode now follows these rules")}
        </p>
      )}
    </form>
  );
}

function RuleCard({ title, sub, enabled, onToggle, name, children }: {
  title: string; sub: string; enabled: boolean; onToggle: (v: boolean) => void; name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <label className="flex items-center justify-between">
        <span>
          <span className="block font-bold text-[color:var(--ink)]">{title}</span>
          <span className="text-xs text-[color:var(--muted)]">{sub}</span>
        </span>
        <input type="checkbox" name={name} checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="h-6 w-6 shrink-0 accent-[var(--brand-solid)]" />
      </label>
      {/* الحقول تبقى في النموذج حتى والقسم مطفأ — الإطفاء المؤقت لا يمحو قيم المالك */}
      <div className={enabled ? "mt-4 space-y-3" : "hidden"}>{children}</div>
    </div>
  );
}
