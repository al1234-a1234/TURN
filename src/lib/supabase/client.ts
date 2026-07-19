import { createBrowserClient } from "@supabase/ssr";

/**
 * عميل Supabase للمكوّنات التي تعمل في المتصفح (Client Components).
 * يستخدم المفتاح العام (publishable/anon) الآمن للاستخدام في العميل.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
