import { loadOwner } from "../owner-context";
import { staffHasPermission } from "@/lib/features";
import { tr, type Lang } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { MANUAL, OWNER_MANUAL, type Bilingual, type ManualEntry, type ManualSection } from "@/lib/guide-manual";

/**
 * دليل الاستخدام داخل التطبيق — صفحةٌ تُقرأ، لا ميزةٌ تُشغَّل.
 *
 * ── قرارٌ اتُّخذ بلا سؤال ──
 * المبدأ الحاكم أنّ كلّ ميزةٍ اختياريّةٌ يفعّلها كلّ مطعمٍ لنفسه. وهذه ليست
 * ميزة: **توثيقٌ**. ومطعمٌ لم يُفعّل «الدليل» يعني مضيفًا لا يعرف الفرق بين
 * إغلاق الفرع وإيقاف الطابور — وهو بالضبط ما نكتب الدليل لأجله. فالوصولُ
 * إليه مربوطٌ بالصلاحيّة لا بالتفعيل.
 *
 * ── ولماذا مكوّن خادمٍ بلا أيّ JS ──
 * صفحةُ نصٍّ تُقرأ مرّةً وتُغلق. أيّ طيٍّ تفاعليّ هنا يعني حزمةً تُحمَّل على
 * جوّال مضيفٍ على شبكة مطعم، ثمنًا لطيّ فقرة.
 */
/**
 * ⛔ استثناءٌ مقصودٌ ومسجَّل: هذه الصفحة وحدها بلا `ScreenGuide`.
 *
 * كلّ شاشةٍ أخرى في اللوحة تحمل لوحة شرحٍ محلّيّة من ثلاثة أسطر تنتهي برابط
 * «التفاصيل الكاملة ←» المتّجه إلى هنا (`/dashboard/guide#<قسم>`). ووضعُ تلك
 * اللوحة على هذه الصفحة يعني ملخّصًا للصفحة التي تقرؤها أصلًا، ينتهي بزرٍّ
 * يُنزلك إلى مرساةٍ في الصفحة نفسها — دورةٌ مغلقة لا تُفيد قارئًا.
 *
 * فالفصل مقصود: هذه هي المرجع الكامل، و`ScreenGuide` هو الملخّص المحلّيّ في
 * ما عداها. (جرد التغطية الكامل في PR «تغطية الدليل الموزّع لكل شاشة».)
 */
export default async function GuidePage() {
  const lang = await getLang();
  const load = await loadOwner();
  if (load.state !== "ok") return null;
  const { role, permissions } = load.ctx;

  // من يضبط الإعدادات يرى دليل المالك. والمضيف يرى دليله وحده — لا لأنّ
  // الباقي سرّ، بل لأنّ صفحةً تشرح ما لا يستطيع فعله تُضيّع عليه ما يستطيع.
  const isOwnerLevel = staffHasPermission(role, permissions, "settings");
  const sections = isOwnerLevel ? [...MANUAL, ...OWNER_MANUAL] : MANUAL;

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-[color:var(--ink)]">
          {tr(lang, "الدليل", "Guide")}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {isOwnerLevel
            ? tr(lang, "كلّ ميزة: ماذا تفعل، ومتى تُستخدم، وفرقها عن المشابه لها.", "Every feature: what it does, when to use it, and how it differs from similar ones.")
            : tr(lang, "شاشة الاستقبال: ماذا يفعل كلّ زرّ، ومتى.", "The reception screen: what each button does, and when.")}
        </p>
      </div>

      {/* فهرسٌ قصير: الصفحة طويلة، ومن يبحث عن جوابٍ واحدٍ لا يقرأ من أوّلها */}
      <nav className="soft-card flex flex-wrap gap-2 p-4">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-xl px-3 py-1.5 text-xs font-bold"
            style={{ background: "rgba(102,28,10,0.06)", color: "var(--brand-d)" }}
          >
            {pick(s.title, lang)}
          </a>
        ))}
      </nav>

      {sections.map((s) => (
        <Section key={s.id} section={s} lang={lang} />
      ))}
    </div>
  );
}

function pick(b: Bilingual, lang: Lang): string {
  return lang === "en" ? b[1] : b[0];
}

function Section({ section, lang }: { section: ManualSection; lang: Lang }) {
  return (
    <section id={section.id} className="space-y-3">
      <h2 className="font-display text-xl font-bold text-[color:var(--ink)]">{pick(section.title, lang)}</h2>
      {section.intro && (
        <p className="text-sm font-medium text-[color:var(--muted)]">{pick(section.intro, lang)}</p>
      )}
      {section.entries.map((e) => (
        <Entry key={e.title[0]} entry={e} lang={lang} />
      ))}
    </section>
  );
}

function Entry({ entry, lang }: { entry: ManualEntry; lang: Lang }) {
  return (
    <article className="soft-card space-y-2 p-5">
      <h3 className="text-base font-extrabold text-[color:var(--ink)]">{pick(entry.title, lang)}</h3>

      <Row label={tr(lang, "ماذا تفعل", "What it does")} text={pick(entry.what, lang)} />
      <Row label={tr(lang, "متى تُستخدم", "When to use it")} text={pick(entry.when, lang)} />
      {entry.vs && (
        <Row
          label={tr(lang, "الفرق عن المشابه", "How it differs")}
          text={pick(entry.vs, lang)}
          strong
        />
      )}
    </article>
  );
}

function Row({ label, text, strong = false }: { label: string; text: string; strong?: boolean }) {
  return (
    <p className="text-sm leading-relaxed">
      <span
        className="me-2 inline-block rounded-lg px-2 py-0.5 text-[11px] font-bold align-middle"
        style={
          strong
            ? { background: "var(--brand-solid)", color: "var(--brand-ink)" }
            : { background: "rgba(102,28,10,0.06)", color: "var(--brand-d)" }
        }
      >
        {label}
      </span>
      <span className="font-medium text-[color:var(--ink)]">{text}</span>
    </p>
  );
}
