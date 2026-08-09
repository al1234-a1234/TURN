/**
 * حارس نطاق مفتاح الخدمة.
 *
 * `supabase/admin.ts` يحمل مفتاحًا يتجاوز كل سياسات RLS — أي ملفٍ يستورده يصير
 * قادرًا على قراءة كل مطعمٍ وكل عميل. و`server-only` يمنع وصوله إلى المتصفّح،
 * لكنه لا يمنع توسّعه داخل الخادم: يستورده أحدهم «مؤقّتًا» لتجاوز RLS مزعج،
 * فيبقى. هذا الاختبار يجعل التوسّع قرارًا مكتوبًا لا انزلاقًا صامتًا.
 *
 * إن احتجت مسارًا جديدًا حقًّا: أضِفه إلى ALLOWED واكتب في نفس الـcommit لماذا
 * لا يكفيه عميل المستدعي.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(import.meta.dirname, "..", "src");

/** الملفات المسموح لها باستيراد عميل الخدمة، ولماذا. */
const ALLOWED = new Set([
  // إرسال إشعارات الطابور: دواله سُحبت من anon كي لا تُسرَّب بيانات الاشتراك
  join("lib", "push.ts"),
  // قلم الضيف: دوالّ الكتابة سُحبت من anon (0093) كي لا تُنادى من خارج
  // خادمنا، فتُتخطّى حراسُه — حدّ العنوان وتطبيع الرقم وقصّ القسم. وهذا
  // الملفّ هو المنفذ الوحيد لها، فيبقى التوسّع في ملفٍّ واحدٍ لا في عشرة.
  join("lib", "supabase", "guest-writes.ts"),
  // الوحدة نفسها
  join("lib", "supabase", "admin.ts"),
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

test("عميل الخدمة لا يُستورد إلا من المسارات المصرَّح بها", () => {
  // يلتقط الصيغتين: "@/lib/supabase/admin" و "./admin" من داخل مجلّد supabase
  const importsAdmin =
    /(?:from|import\s*\(|require\s*\(\s*)\s*["'](?:@\/lib\/supabase\/admin|\.{1,2}(?:\/[\w.-]+)*\/admin|\.\/admin)["']/;

  const offenders = walk(SRC)
    .filter((f) => importsAdmin.test(readFileSync(f, "utf8")))
    .map((f) => relative(SRC, f))
    .filter((rel) => !ALLOWED.has(rel.split("/").join(sep)));

  assert.deepEqual(
    offenders,
    [],
    `مفتاح الخدمة يتجاوز RLS. هذه الملفات تستورده بلا تصريح:\n  ${offenders.join("\n  ")}\n` +
      `أضِفها إلى ALLOWED في هذا الاختبار عمدًا، أو استعمل عميل المستدعي.`,
  );
});

test("عميل الخدمة يحمل server-only ولا يستعمل بادئة NEXT_PUBLIC للمفتاح", () => {
  const src = readFileSync(join(SRC, "lib", "supabase", "admin.ts"), "utf8");
  assert.match(src, /^import\s+["']server-only["'];/m, "غياب server-only يفتح باب حزمة المتصفّح");
  assert.doesNotMatch(
    src,
    /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SERVICE/,
    "بادئة NEXT_PUBLIC تحقن المفتاح في حزمة المتصفّح",
  );
});
