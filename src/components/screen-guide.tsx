import Link from "next/link";
import { tr, type Lang } from "@/lib/i18n";

/**
 * شرحٌ محلّيّ لشاشةٍ واحدة — ملخّصٌ لا نسخة ثانية من الدليل.
 *
 * ── لماذا موزّعٌ لا مركزيّ فقط ──
 * صفحة `/dashboard/guide` تبقى المرجع الكامل، لكنّ من يقف أمام شاشة الاستقبال
 * وقتَ الزحام لا يفتح صفحةً أخرى ليعرف ماذا يفعل الزرّ أمامه. فالشرح يذهب إليه
 * حيث هو: ثلاثة أسطرٍ تشرح **هذه الشاشة وحدها**، ثمّ رابطٌ لمن أراد التوسّع.
 *
 * ── القاعدة التي يفرضها هذا المكوّن ──
 * لا تكرار نصٍّ كامل. ثلاثة أسطرٍ كحدٍّ أقصى — والحدّ مفروضٌ في الكود لا في
 * النيّة (`slice(0, 3)`)، لأنّ «سطرًا صغيرًا إضافيًّا» هو بالضبط ما يحوّل
 * الملخّص إلى صفحةٍ ثانية خلال شهر.
 */
export function ScreenGuide({
  lang,
  lines,
  anchor,
  className = "",
}: {
  lang: Lang;
  /** أسطرٌ مترجمةٌ جاهزة (يُترجمها المُستدعي بـ`tr`) — ثلاثةٌ كحدٍّ أقصى. */
  lines: readonly string[];
  /** قسمٌ في الدليل المركزيّ: `three` · `reception` · `messages` · `owner`. */
  anchor: "three" | "reception" | "messages" | "owner";
  className?: string;
}) {
  return (
    <section className={`soft-card p-4 ${className}`.trim()}>
      <p className="text-sm font-bold text-[color:var(--ink)]">
        {tr(lang, "هذه الشاشة باختصار", "This screen in brief")}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-[color:var(--muted)]">
        {lines.slice(0, 3).map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>
      <Link
        href={`/dashboard/guide#${anchor}`}
        className="mt-3 inline-block rounded-xl px-3 py-1.5 text-xs font-bold"
        style={{ background: "rgba(102,28,10,0.06)", color: "var(--brand-d)" }}
      >
        {tr(lang, "التفاصيل الكاملة ←", "Full details →")}
      </Link>
    </section>
  );
}
