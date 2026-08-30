"use client";

import type { ReactNode } from "react";

/**
 * مفتاح التشغيل/الإيقاف الموحّد — دائرةٌ منزلقة ولونان واضحان.
 *
 * ── العطب الذي وُلد منه ──
 * كان في اللوحة ثلاثة أشكالٍ لفكرةٍ واحدة:
 *   ١) مفتاحٌ منزلقٌ صحيح في «وحدات المطعم» (لوحة المنصّة).
 *   ٢) مربّع اختيارٍ خام في «الإعدادات» (استقبال الانتظار/الحجوزات).
 *   ٣) أزرارٌ نصّيّة في شاشة الاستقبال — **بلا أيّ فرقٍ لونيّ بين الحالتين**:
 *      كان الشرط `closed ? {brand-solid} : {brand-solid}` أي لونٌ واحد في
 *      الحالتين، والنصّ وحده يتغيّر. فمن ينظر نظرةً سريعة لا يعرف: أمفتوحٌ
 *      الفرع أم مغلق؟ يقرأ الجملة كاملةً في كلّ مرّة — وهو واقفٌ أمام عميل.
 *
 * فصار الشكل واحدًا: مطفأ = رماديّ، مشتغل = لون الهويّة، والدائرة تنزلق.
 * لا يُقرأ بالكلمات بل يُرى.
 *
 * ── شكلٌ فقط ──
 * لا منطق هنا إطلاقًا: لا نداء خادم، ولا حالة داخليّة، ولا قرار. المكوّن
 * يعرض `on` ويُبلّغ `onToggle`. ولذلك جاء بنسختين:
 *   `ToggleSwitch` — زرٌّ يقوده JS (تحديثٌ متفائل ثمّ مزامنة).
 *   `ToggleField`  — `<input type="checkbox">` حقيقيّ داخل نموذج، باسمه
 *                    وقيمته كما هي. الشكل وحده تغيّر، والإرسال لم يُمسّ.
 */

const TRACK = "relative h-7 w-12 shrink-0 rounded-full transition";
const KNOB = "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-[color:var(--surface)] shadow transition-all";

function trackStyle(on: boolean) {
  return {
    background: on ? "var(--brand-solid)" : "var(--surface-2)",
    border: "1px solid var(--border)",
  };
}

/** موضع الدائرة: البداية حين يكون مطفأً، والنهاية حين يشتغل. */
function knobStyle(on: boolean) {
  return { insetInlineStart: on ? "1.55rem" : "0.2rem" };
}

/**
 * المسار والدائرة وحدهما — لمن يملك تخطيطه الخاصّ ولا يريد بطاقةً كاملة
 * (صلاحيّات الموظّف · بطاقة العميل · حملة الاسترجاع). الهندسة واحدة هنا،
 * فلا تعود ثلاثةَ مقاساتٍ تختلف بالبكسل بلا سبب.
 */
export function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span className={TRACK} style={trackStyle(on)}>
      <span className={KNOB} style={knobStyle(on)} />
    </span>
  );
}

/** الغلاف المشترك: عنوانٌ وشرحٌ يمينًا، والمفتاح يسارًا. */
function Shell({ title, hint, control }: { title: ReactNode; hint?: ReactNode; control: ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border p-4"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[color:var(--ink)]">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-[color:var(--muted)]">{hint}</span>}
      </span>
      {control}
    </div>
  );
}

export function ToggleSwitch({
  on,
  onToggle,
  title,
  hint,
  disabled = false,
  srLabel,
}: {
  on: boolean;
  onToggle: () => void;
  title: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  /** اسمٌ للقارئ الصوتيّ حين لا يكفي العنوان المرئيّ. */
  srLabel?: string;
}) {
  return (
    <Shell
      title={title}
      hint={hint}
      control={
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={srLabel}
          disabled={disabled}
          onClick={onToggle}
          className={`${TRACK} disabled:cursor-not-allowed disabled:opacity-50`}
          style={trackStyle(on)}
        >
          <span className={KNOB} style={knobStyle(on)} />
        </button>
      }
    />
  );
}

/**
 * نفس الشكل، لكنّ القلب `<input type="checkbox">` حقيقيّ — يُرسَل مع النموذج
 * باسمه كما كان. `peer` يقلب اللون والموضع بالـCSS بلا سطر JS واحد.
 */
export function ToggleField({
  name,
  defaultChecked,
  title,
  hint,
  disabled = false,
}: {
  name: string;
  defaultChecked: boolean;
  title: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border p-4"
           style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[color:var(--ink)]">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-[color:var(--muted)]">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          disabled={disabled}
          className="peer h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
        {/* المسار الملوّن حين يُختار — فوق الـinput وبلا التقاط الضغطة */}
        <span
          className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition peer-checked:opacity-100"
          style={{ background: "var(--brand-solid)", border: "1px solid var(--border)" }}
        />
        <span className={`${KNOB} pointer-events-none start-[0.2rem] peer-checked:start-[1.55rem]`} />
      </span>
    </label>
  );
}
