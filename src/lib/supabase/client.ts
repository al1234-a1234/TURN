import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * عميل Supabase للمكوّنات التي تعمل في المتصفح (Client Components).
 * يستخدم المفتاح العام (publishable/anon) الآمن للاستخدام في العميل.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
