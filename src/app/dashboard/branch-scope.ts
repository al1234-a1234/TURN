import "server-only";
import type { OwnerContext } from "./owner-context";

export type ScopedBranch = { id: string; name: string; city: string | null };

/**
 * يحدّد فروع الحساب والفرع النشِط لصفحات المحتوى (القائمة، العروض، الصور).
 *
 * - حساب مربوط بفرع (فرانشايز) → يرى فرعه فقط، بلا تبويبات.
 * - حساب غير مربوط ومطعمه متعدّد الفروع → يختار الفرع من التبويبات (?branch=).
 * كل صفحات المحتوى تمرّ من هنا كي لا تختلف قواعد الفصل من شاشة لأخرى.
 */
export async function resolveBranchScope(
  ctx: OwnerContext,
  requestedId?: string,
): Promise<{ branches: ScopedBranch[]; active: ScopedBranch | null; multi: boolean }> {
  const { data } = await ctx.supabase
    .from("branches")
    .select("id, name, city")
    .eq("restaurant_id", ctx.restaurant.id)
    .eq("is_active", true)
    .order("created_at");

  const all = (data ?? []) as ScopedBranch[];
  const branches = ctx.branchId ? all.filter((b) => b.id === ctx.branchId) : all;
  const active = branches.find((b) => b.id === requestedId) ?? branches[0] ?? null;

  return { branches, active, multi: branches.length > 1 };
}
