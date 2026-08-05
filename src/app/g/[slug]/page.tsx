import { redirect } from "next/navigation";

/**
 * مسار قديم: كان صفحة «امسح خذ هديتك» التي تلتقط الأرقام مقابل هدية.
 * أُلغيت المنظومة كلها — الباركود صار يوصل لصفحة المطعم مباشرة ليأخذ الزبون دوره.
 *
 * أُبقي المسار محوِّلًا لا محذوفًا: ملصقات مطبوعة قديمة قد تكون معلّقة في مطعم،
 * ومسحُها يجب أن يوصل للدور لا لصفحة خطأ. لا تحذف هذا الملف.
 */
export const dynamic = "force-dynamic";

export default async function LegacyScanRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ b?: string }>;
}) {
  const { slug } = await params;
  const { b } = await searchParams;
  redirect(b ? `/r/${slug}?branch=${b}` : `/r/${slug}`);
}
