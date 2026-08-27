"use client";

import Link from "next/link";
import { SmartImage } from "@/components/smart-image";
import { useLang } from "@/components/lang-provider";
import { storePeek } from "@/lib/peek";
import { IconPlate } from "@/components/icons";
import { useMemo, useState } from "react";
import { toAr } from "@/lib/format";
import { tr, type Lang } from "@/lib/i18n";

export type DiscoveryItem = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cuisine: string | null;
  cuisine_en: string | null;
  waiting: number;
  accepts: boolean;
  closedNow: boolean;
  rating: string | null;
  branchCount: number;
  /** توزيع الطابور بأسماء أقسام المالك — لمطعم الفرع الواحد فقط */
  zones: { name: string; waiting: number }[];
};

/**
 * فاصلٌ عنصرٌ لا حرف. النقطة المكتوبة «·» تنقلب مع الأرقام في السياق
 * ثنائي الاتجاه، فتُقرأ «فرعان · برجر» أحيانًا ملتصقةً بالرقم قبلها.
 */
function Dot() {
  return (
    <span
      aria-hidden
      className="mx-[7px] inline-block h-[3px] w-[3px] shrink-0 rounded-full bg-current align-middle opacity-45"
    />
  );
}

/**
 * الرقم أكبر وأثقل من الكلمة حوله.
 *
 * كان سطر الحالة كلّه ١٣px/٦٠٠ — أي أن «7» في «داخلي 7» له وزنُ حرفٍ في
 * سطرٍ رمادي، مع أنه الخبر الوحيد الذي فُتح التطبيق لأجله. الكلمة وصفٌ
 * للرقم لا العكس، فتأخذ حجمها الطبيعي ويأخذ الرقم الرتبة.
 */
function strongDigits(s: string) {
  return s.split(/(\d+)/).map((tok, i) =>
    /^\d+$/.test(tok) ? (
      <strong key={i} className="text-[15.5px] font-bold tabular-nums">{tok}</strong>
    ) : (
      <span key={i}>{tok}</span>
    ),
  );
}

function branchesLabel(n: number, lang: Lang): string {
  if (lang === "en") return n === 1 ? "1 branch" : `${n} branches`;
  if (n === 1) return "فرع واحد";
  if (n === 2) return "فرعان";
  return n <= 10 ? `${toAr(n)} فروع` : `${toAr(n)} فرعًا`;
}

/**
 * حالة البطاقة: سطرُ نصٍّ واحد يحمل لونه — لا بنر ولا كبسولات.
 *
 * كانت الحالات الأربع كلّها تُطبع على نفس العنابي (`--brand-solid`)، فاللون
 * لا يفرّق «مغلق» عن «متاح»، والعين لا تستطيع فرز القائمة إلا بقراءة كل صفّ.
 * الهوية تملك ألوان الحالات أصلًا (`--st-open` / `--st-closed`) ولم تكن
 * تُستعمل هنا. الآن اللون هو الجواب: عنابيّ فيه انتظار، أخضر بلا انتظار،
 * رماديّ مغلق.
 *
 * والصفر لا يُطبع: «خارجي 0» يُقرأ زخرفةً لا خبرًا، فالقسم الفارغ يسقط.
 */
type Tone = "closed" | "open" | "busy";
type CardState = {
  /** الكبسولة في الطرف الأيسر تحت التقييم — كلمةُ الحالة وحدها */
  chip: string | null;
  tone: Tone;
  /** التفصيل تحت الاسم: «٣ داخلي · ٢ خارجي» — خبرٌ لا حالة */
  parts: string[];
};

function cardState(r: DiscoveryItem, lang: Lang): CardState {
  // المغلق يبقى بطاقةً كاملةً كبقيّة البطاقات — لا تخافُتَ ولا تصميمًا
  // مختلفًا. الخبر في سطر الحالة وحده، والمطعم يُعرض بكامل هيئته لأن العميل
  // قد يفتحه ليرى موقعه أو موعد فتحه.
  //
  // وبعنابيّ الهويّة لا رماديّ: جرّبتُ الرمادي خوفًا من التباسه بعنابيّ
  // الطابور، فصار الصفّ ثلاثة ألوان — اسمٌ داكن، وسطران عنابيّان، وسطرٌ
  // رماديّ — يُرى تفاوتًا قبل أن يُقرأ خبرًا. والالتباس مدفوعٌ أصلًا:
  // «مغلق حاليًّا» عنوانُ قسمٍ فوقه يجمع المغلقين وحدهم.
  if (r.closedNow) return { chip: tr(lang, "مغلق الآن", "Closed now"), tone: "closed", parts: [] };
  if (!r.accepts) return { chip: tr(lang, "استقبال مباشر", "Walk in"), tone: "open", parts: [] };

  // متعدّد الفروع: لا رقم من الخارج.
  //
  // كانت البطاقة تعرض رقم «أقصر طابور» بين فروعه، فيقرؤه العميل رقمَ
  // المطعم كلّه — ثم يدخل فيجد رقمًا آخر عند الفرع. فرعان بطابورين
  // مختلفين لا يختصرهما رقمٌ واحد بلا كذب، والصواب أن يدخل ويختار فرعه.
  // متعدّد الفروع: لا سطر حالة أصلًا.
  //
  // كتبتُه أوّلًا «فرعان» بالذهبيّ — وكان تكرارًا: `branchesLabel` تقولها
  // فوقه تحت الاسم منذ البداية. وعنوان القسم («متاح الآن» / «فيه طابور»)
  // يحمل الحالة. فسطرٌ ثالث يعيد ما قيل مرّتين حشوٌ لا خبر.
  if (r.branchCount > 1) return { chip: null, tone: "busy", parts: [] };

  // فرعٌ واحد: الكبسولة تقول الحالة، والتفصيل تحت الاسم بأسماء المالك —
  // «٣ عوائل · ٢ أفراد». العميل يسأل «أين أجلس؟» لا «كم العدد؟»، والاسم
  // يجيبه والرقم لا. ولا يُحشر التوزيع في الكبسولة: يطول فيضغط الاسم.
  if (r.zones.length) {
    return {
      chip: tr(lang, "فيه طابور", "In queue"),
      tone: "busy",
      parts: r.zones.slice(0, 3).map((z) => tr(lang, `${toAr(z.waiting)} ${z.name}`, `${z.waiting} ${z.name}`)),
    };
  }

  if (r.waiting > 0) {
    return {
      chip: tr(lang, "فيه طابور", "In queue"),
      tone: "busy",
      parts: [tr(lang, `${toAr(r.waiting)} بالانتظار`, `${r.waiting} waiting`)],
    };
  }
  return { chip: tr(lang, "متاح الآن", "Available"), tone: "open", parts: [] };
}

/**
 * كبسولة الحالة — في الطرف الأيسر تحت التقييم.
 *
 * كانت سطرًا رابعًا تحت الاسم، فيقرؤها العميل امتدادًا لوصف المطعم
 * («فرعان · إيطالي · مغلق الآن») وهي ليست وصفًا بل حالةً تتغيّر كل ساعة.
 * وأن يبحث عنها في آخر ثلاثة أسطر متشابهة يبطّئ الفرز — والشاشة مهمّةُ
 * فرزٍ قبل كل شيء. فصارت لها زاويةٌ ثابتة: يمسح العين عمودًا واحدًا
 * فيعرف من يستقبله الآن.
 */
const CHIP_STYLE: Record<Tone, React.CSSProperties> = {
  // المغلق لا فعل فيه: كبسولةٌ هادئة بحدٍّ لا مساحةٌ مصمتة تنادي
  closed: { background: "var(--surface-2)", color: "var(--brand-d)", border: "1px solid var(--border)" },
  // كانت --st-open (أخضر) هنا، ثم جُرِّب الذهبيّ (--star) — كلاهما رُفض:
  // المشغّل صريح أن هويتنا عنابيّةٌ لا ذهبية. فصار عنابيًّا فاتحًا (شفافية
  // خفيفة من نفس رقم الهوية، لا لونًا ثانيًا) — يبقى مميَّزًا عن «مشغول»
  // العنابي المصمت بخفّة الامتلاء لا باختلاف الدرجة، وعن «مغلق» بغياب
  // الحدّ. ثلاثتها عنابيّ، يتفاوت وزنه: شفاف خفيف / حدٌّ فقط / مصمتٌ كامل.
  open: { background: "rgba(120,30,12,0.12)", color: "var(--brand-solid)", border: "1px solid transparent" },
  busy: { background: "var(--brand-solid)", color: "var(--brand-ink)", border: "1px solid transparent" },
};

function StateChip({ text, tone }: { text: string; tone: Tone }) {
  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11px] font-extrabold leading-[1.6]"
      style={CHIP_STYLE[tone]}
    >
      {text}
    </span>
  );
}

function Card({ r, lang }: { r: DiscoveryItem; lang: Lang }) {
  const initial = (r.name ?? "").trim().charAt(0) || "م";
  const state = cardState(r, lang);

  return (
    <Link
      href={`/r/${r.slug}`}
      onClick={() => storePeek(r.slug, { name: r.name, logo: r.logo_url, waiting: r.waiting, closed: r.closedNow })}
      className="rq-row flex items-center gap-[13px] px-4 py-[13px]"
    >
      {/* البلاطة بيضاء بحدٍّ شعرة: الشعار يضعه صاحب المطعم، فلا نصبغه بلوننا.
          و٦٤ لا ٧٢: عند ٧٢ يتجاوز ارتفاعُ البلاطة كتلةَ الأسطر الثلاثة فيبقى
          فراغٌ ميّت أسفل النصّ، والصفّ يُقرأ غير مستوٍ.
          والانحناء ١٢ لا دائرة: جُرِّبت الدائرة هنا فرآها المشغّل «غير جيدة»
          وطلب إرجاعها صراحةً — البلاطة المربّعة أهدأ داخل صفٍّ انحناؤه ١٤. */}
      <span
        className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-white text-2xl font-bold"
        style={{ border: "1px solid var(--border)", color: "var(--brand-solid)" }}
      >
        {r.logo_url ? (
          <SmartImage src={r.logo_url} fallbackText={r.name} alt="" width={64} height={64} sizes="64px" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </span>

      {/* عمودان: يمينًا من هو المطعم، ويسارًا كيف حاله الآن.
          كانت الحالة سطرًا رابعًا تحت الاسم فتُقرأ امتدادًا للوصف — «فرعان ·
          إيطالي · مغلق الآن» — وهي ليست وصفًا بل حالةً تتغيّر كل ساعة.
          والشاشة مهمّةُ فرز؛ فالحالة في زاويةٍ ثابتة تُمسح بعمودٍ واحد. */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[17px] font-semibold leading-[1.45] text-[color:var(--ink)]">{r.name}</p>
        {/* سطران لا سطر: الفروع والمطبخ خبران مختلفان — «أين؟» و«ماذا؟» —
            وجمعهما بنقطةٍ كان يجعل العين تقرؤهما جملةً واحدة.
            وبلون الهوية لا الرمادي: هذا وصف المطعم لا حاشيةٌ باهتة.
            وبعنابيٍّ واحدٍ غير مخفّف: كنتُ أُخفّت المطبخ إلى ٠٫٧٢ لأرتّبه
            تحت الفروع، فبدا لونًا ثالثًا شاحبًا لا درجةً أخفت. والترتيب
            يحمله وزنُ الخطّ (semibold ثم medium) بلا أن يُمَسّ اللون. */}
        <p className="truncate text-[13px] font-semibold leading-[1.5]" style={{ color: "var(--brand-d)" }}>
          {branchesLabel(r.branchCount, lang)}
        </p>
        {r.cuisine && (
          <p className="truncate text-[13px] font-medium leading-[1.5]" style={{ color: "var(--brand-d)" }}>
            {tr(lang, r.cuisine, r.cuisine_en ?? r.cuisine)}
          </p>
        )}
        {state.parts.length > 0 && (
        <p className="mt-px flex items-baseline text-[13px] font-semibold leading-[1.55]" style={{ color: "var(--brand-solid)" }}>
          {state.parts.map((p, i) => (
            <span key={p}>
              {i > 0 && <Dot />}
              {strongDigits(p)}
            </span>
          ))}
        </p>
        )}
      </div>

      {/* الطرف الأيسر: التقييم فوق الحالة — كلاهما حكمٌ على المطعم لا وصفٌ
          له، وعمودٌ واحد يجمعهما يجعل الصفّ يُقرأ من طرفيه لا من وسطه.
          self-stretch + justify-between يفصلهما إلى ركني العمود (التقييم
          أعلى يحاذي الاسم، والكبسولة أسفل تحاذي آخر سطر) بدل تكتّلهما
          مجتمعين في المنتصف عموديًّا كما كانا — طلبٌ صريح بعد لقطة شاشة. */}
      <div className="flex shrink-0 flex-col items-end justify-between self-stretch gap-1.5">
        {r.rating ? (
          <span className="flex items-center gap-1 text-[13px] font-semibold tabular-nums text-[color:var(--ink)]">
            <span style={{ color: "var(--star)" }}>★</span>
            {r.rating}
          </span>
        ) : null}
        {state.chip && <StateChip text={state.chip} tone={state.tone} />}
      </div>
    </Link>
  );
}

// العنوان يقول اسم القسم فقط. كان «متاح الآن · بدون انتظار» ثم كل بطاقةٍ
// تحته تعيد «بلا انتظار» — تكرارٌ يملأ الشاشة بلا خبرٍ جديد.
function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    // ‎-mx-1 يلغي ٤px من حشو `main` (٢٠) فيبدأ العنوان عند ١٦ — نفس الخطّ
    // الذي تبدأ عنده بلاطة الصفّ تحته. العنوان الطائر فوق قائمةٍ ملتصقة
    // بالحافّة يحتاج أن يشاركها خطّ بدايتها وإلا بدا معلّقًا.
    <div className="mb-2 mt-1 -mx-1 flex items-baseline gap-2">
      <h2 className="font-display text-[14px] font-bold text-[color:var(--brand-d)]">{label}</h2>
      <span className="text-[12px] font-semibold tabular-nums text-[color:var(--muted)]">{toAr(count)}</span>
    </div>
  );
}

export function DiscoveryList({ items }: { items: DiscoveryItem[] }) {
  // اللغة من السياق لا من الخادم: هكذا تبقى الصفحة قابلة للتخزين على الحافة.
  const lang = useLang();
  const [cuisine, setCuisine] = useState<string>("");
  const [filterOpen, setFilterOpen] = useState(false);

  // المسافة حُذفت من البطاقة، ومعها قراءة الموقع التي كانت تغذّيها وحدها:
  // لم تعد الرئيسية تستعلم عن إذن الموقع ولا تشغّل جهاز تحديد الموقع إطلاقًا.

  // شرائح المطابخ — مشتقّة من المطاعم المعروضة (بلا تكرار)
  const cuisines = useMemo(() => {
    const seen = new Map<string, string | null>();
    for (const r of items) {
      const c = (r.cuisine ?? "").trim();
      if (c && !seen.has(c)) seen.set(c, r.cuisine_en);
    }
    return Array.from(seen, ([ar, en]) => ({ ar, en }));
  }, [items]);

  const filtered = useMemo(
    () => (cuisine ? items.filter((r) => (r.cuisine ?? "").trim() === cuisine) : items),
    [items, cuisine],
  );

  // تجميع بثلاثة أقسام: متاح الآن (يشمل مين ما عليه طابور، ومن لا يستخدم نظام
  // الطابور أصلًا — كلاهما يعني «ادخل على طول» للعميل) · فيه طابور الآن ·
  // مغلق حاليًا (يدويًا من الاستقبال أو خارج أوقات الدوام) — يظهر أخيرًا فقط
  // للتصفّح، بلا دعوة لأخذ دور.
  const groups = useMemo(() => {
    const open = filtered.filter((r) => !r.closedNow);
    const closed = filtered.filter((r) => r.closedNow);
    const available = open.filter((r) => r.waiting === 0);
    const queued = open.filter((r) => r.waiting > 0).sort((a, b) => a.waiting - b.waiting);
    // متاح: الأعلى تقييمًا أولًا
    available.sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
    return [
      { key: "available", label: tr(lang, "متاح الآن", "Available now"), rows: available },
      { key: "queued", label: tr(lang, "فيه طابور الآن", "Queue running now"), rows: queued },
      { key: "closed", label: tr(lang, "مغلق حاليًا", "Closed now"), rows: closed },
    ].filter((g) => g.rows.length > 0);
  }, [filtered, lang]);

  const selected = cuisines.find((c) => c.ar === cuisine);
  const selectedLabel = selected ? tr(lang, selected.ar, selected.en ?? selected.ar) : "";

  // كان الفرعان يعيدان نفس التنسيق حرفيًّا، فالمطبخ المختار لا يتميّز عن
  // بقيّة الخيارات داخل القائمة المنسدلة — لا يعرف العميل ماذا اختار.
  const chip = (active: boolean) =>
    active
      ? { background: "var(--brand-solid)", color: "var(--brand-ink)", border: "1px solid transparent" }
      : { background: "var(--surface)", color: "var(--brand-d)", border: "1px solid var(--border)" };

  // حالة الفراغ انتقلت إلى هنا من الصفحة: نصُّها مترجَم، وبقاؤه على الخادم
  // كان يُلزم الصفحةَ بقراءة اللغة فتفقد قابليّة التخزين على الحافة.
  if (items.length === 0) {
    return (
      <div className="rq-card p-10 text-center text-[color:var(--muted)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-cream-100" style={{ background: "var(--brand-solid)" }}>
          <IconPlate size={26} />
        </span>
        <p className="mt-3 text-sm">{tr(lang, "لا توجد مطاعم متاحة بعد.", "No restaurants available yet.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* تصفية المطابخ — زر يفتح الخيارات */}
      {cuisines.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setFilterOpen((o) => !o)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold transition active:scale-95"
            // يمتلئ بالعنابي حين يكون هناك مطبخٌ مختار فقط. كان ممتلئًا دائمًا،
            // فيصير أصخب شيءٍ في الشاشة وهو لا يحمل خبرًا عن أيّ مطعم.
            style={chip(Boolean(cuisine))}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {cuisine ? selectedLabel : tr(lang, "تصفية", "Filter")}
            {cuisine ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setCuisine(""); setFilterOpen(false); }}
                className="ms-0.5 grid h-4 w-4 place-items-center rounded-full bg-white/25 text-[11px] leading-none"
              >
                ✕
              </span>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden style={{ transform: filterOpen ? "rotate(180deg)" : "none" }}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          {filterOpen && (
            <>
              <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setFilterOpen(false)} />
              <div
                className="absolute z-20 mt-2 flex max-h-72 w-[min(20rem,85vw)] flex-wrap gap-2 overflow-y-auto rounded-3xl bg-[color:var(--surface)] p-3 shadow-xl"
                style={{ border: "1px solid rgba(102,28,10,0.12)" }}
              >
                <button
                  onClick={() => { setCuisine(""); setFilterOpen(false); }}
                  className="rounded-full px-3.5 py-1.5 text-[13px] font-bold transition active:scale-95"
                  style={chip(cuisine === "")}
                >
                  {tr(lang, "الكل", "All")}
                </button>
                {cuisines.map((c) => (
                  <button
                    key={c.ar}
                    onClick={() => { setCuisine(c.ar); setFilterOpen(false); }}
                    className="rounded-full px-3.5 py-1.5 text-[13px] font-bold transition active:scale-95"
                    style={chip(cuisine === c.ar)}
                  >
                    {tr(lang, c.ar, c.en ?? c.ar)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* الأقسام المجمّعة */}
      {groups.length === 0 ? (
        <div className="rq-card p-10 text-center text-[color:var(--muted)]">
          <p className="text-sm">{tr(lang, "لا توجد مطاعم بهذا التصنيف.", "No restaurants in this category.")}</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <SectionHeading label={g.label} count={g.rows.length} />
            {/* كتلةٌ واحدة لكل قسم: إطارٌ واحد وظلٌّ واحد، والصفوف موصولة
                بخطّ شعرة. الفجوة الوحيدة بين قسمٍ وقسم — وهي فجوةٌ تحمل
                معنًى (متاح ← فيه طابور ← مغلق) لا فجوةً بين كل مطعمين. */}
            <div className="rq-group">
              {g.rows.map((r) => (
                <Card key={r.id} r={r} lang={lang} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
