import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * عميل الخدمة (service_role) — للخادم وحده، ولمسارٍ واحد بعينه.
 *
 * لماذا وُجد أصلًا: دوال إشعارات الطابور تُعيد بيانات اشتراك الإشعار
 * (endpoint · p256dh · auth) لمن في الطابور. وكانت مفتوحةً لـ`anon`، لأن ضيفًا
 * بلا حساب هو من يُلغي دوره فيُشعَر من خلفه. لكن المفتاح العام معلومٌ لكل من
 * فتح الصفحة، فمن يملك معرّف تذكرةٍ حيّة كان يستطيع أن يُلغيها ثم يطلب
 * بيانات اشتراك **كل** من في ذلك الفرع — بصمة جهازٍ ثابتة يُتتبَّع بها العميل.
 * (لا يستطيع إرسال إشعارٍ بها: Web Push يشترط توقيع VAPID، ومفتاحه الخاص عندنا.)
 *
 * فصار الخادم يستدعيها بمفتاح الخدمة، وسُحبت من `anon` سحبًا.
 *
 * حرّاس ألّا يتسرّب هذا المفتاح إلى المتصفّح:
 *   ١) `server-only` أعلاه — أي استيرادٍ من مكوّن عميل يُفشل البناء.
 *   ٢) الاسم بلا بادئة `NEXT_PUBLIC_`, فلا يُحقن في حزمة المتصفّح إطلاقًا.
 *   ٣) اختبار في tests/admin-client-scope.test.ts يمنع استيراده من أي ملف
 *      سوى المسموح له — لأن مفتاح الخدمة يتجاوز كل سياسات RLS.
 *
 * إن غاب المتغيّر تُعيد `null` ولا ترمي: الطابور لا يتعطّل من أجل إشعار.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const adminConfigured = Boolean(URL_ && SERVICE_KEY);

let cached: SupabaseClient<Database> | null = null;

export function createAdminClient(): SupabaseClient<Database> | null {
  if (!adminConfigured) return null;
  cached ??= createClient<Database>(URL_, SERVICE_KEY, {
    // لا جلسة ولا تحديث رمز: هذا عميلٌ عديم الحالة يعيش داخل الطلب
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}
