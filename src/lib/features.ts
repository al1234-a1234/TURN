import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * طبقة الموديولز (Feature Flags).
 * كل ميزة في «دور» موديول مستقل يُفعَّل/يُطفأ لكل مطعم على حدة.
 * الأدمن يتحكّم بالباقات (restaurant_features)؛ المالك يشوف فقط المُفعّل.
 *
 * هذا الملف = المصدر الوحيد للحقيقة في طبقة التطبيق.
 * مفاتيح الموديولز هنا يجب أن تطابق كتالوج feature_modules في القاعدة.
 */

export const MODULE_KEYS = [
  "queue",
  "reservations",
  "analytics",
  "menu",
  "reviews",
  "review_routing",
  "offers",
  "loyalty",
  "walkaway",
  "slow_hours",
  "smart_alerts",
  "daily_digest",
  "crm",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/** الموديولات الأساسية — مُفعّلة دائمًا ولا تُطفأ (تطابق is_core في القاعدة). */
export const CORE_MODULES: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  "queue",
  "reservations",
]);

export type ModuleCategory = "core" | "marketing" | "customer_tools" | "operations";

export type FeatureModule = Database["public"]["Tables"]["feature_modules"]["Row"] & {
  key: ModuleKey;
  category: ModuleCategory;
};

type DB = SupabaseClient<Database>;

function isKnownModule(key: string): key is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(key);
}

/**
 * الموديولات المُفعّلة لمطعم معيّن (كمجموعة سريعة الاستعلام).
 *
 * منطق التفعيل (يطابق دالة has_feature في القاعدة):
 *   1) صف صريح في restaurant_features (تحكّم الأدمن بالباقة) يفوز — تفعيل أو إطفاء.
 *   2) وإلا: مُفعّل إذا كان أساسيًا (is_core) أو مُفعّلًا افتراضيًا (default_enabled).
 *   3) وإلا: مطفأ.
 *
 * استعلامان مفهرسان صغيران (الكتالوج 13 صفًا فقط) — رخيص جدًا حتى مع آلاف المطاعم.
 */
export async function getEnabledModules(
  supabase: DB,
  restaurantId: string,
): Promise<Set<ModuleKey>> {
  const [{ data: catalog }, { data: overrides }] = await Promise.all([
    supabase.from("feature_modules").select("key, is_core, default_enabled"),
    supabase
      .from("restaurant_features")
      .select("module_key, enabled")
      .eq("restaurant_id", restaurantId),
  ]);

  const override = new Map<string, boolean>(
    (overrides ?? []).map((o) => [o.module_key, o.enabled]),
  );

  const enabled = new Set<ModuleKey>();
  for (const m of catalog ?? []) {
    if (!isKnownModule(m.key)) continue;
    const on = m.is_core || (override.has(m.key) ? override.get(m.key)! : m.default_enabled);
    if (on) enabled.add(m.key);
  }
  // ضمان الأساسية حتى لو غاب الكتالوج لأي سبب
  for (const core of CORE_MODULES) enabled.add(core);
  return enabled;
}

/** فحص موديول واحد (يعتمد على getEnabledModules — استخدمه عند فحص عدّة موديولات معًا لتفادي استعلامات متكرّرة). */
export function isModuleOn(enabled: Set<ModuleKey>, key: ModuleKey): boolean {
  return CORE_MODULES.has(key) || enabled.has(key);
}

/** الكتالوج الكامل للموديولات المتاحة في المنصّة (لواجهة الأدمن). */
export async function getModuleCatalog(supabase: DB): Promise<FeatureModule[]> {
  const { data } = await supabase
    .from("feature_modules")
    .select("*")
    .order("sort_order");
  return (data ?? []) as FeatureModule[];
}

// ═══════════════════════════════════════════════════════════
// صلاحيات الموظفين المرنة
// ═══════════════════════════════════════════════════════════

export const STAFF_PERMISSIONS = [
  "waitlist",
  "reservations",
  "analytics",
  "offers",
  "loyalty",
  "customers",
  "reviews",
  "settings",
  "team",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const STAFF_PERMISSION_LABELS: Record<StaffPermission, string> = {
  waitlist: "إدارة الطابور",
  reservations: "إدارة الحجوزات",
  analytics: "عرض التحليلات",
  offers: "إدارة العروض",
  loyalty: "إدارة الولاء",
  customers: "ملفّات العملاء",
  reviews: "التقييمات",
  settings: "الإعدادات وأوقات العمل",
  team: "إدارة الفريق",
};

export type StaffPermissionMap = Partial<Record<StaffPermission, boolean>>;

/** المدير/المالك (role: owner|manager) = كل الصلاحيات ضمنيًا؛ غيرهم حسب permissions. */
export function staffHasPermission(
  role: Database["public"]["Enums"]["user_role"],
  permissions: StaffPermissionMap | null | undefined,
  perm: StaffPermission,
): boolean {
  if (role === "owner" || role === "manager") return true;
  return permissions?.[perm] === true;
}
