import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * عميل Supabase لمكوّنات الخادم (Server Components / Route Handlers / Server Actions).
 * يقرأ ويكتب الجلسة عبر ملفات تعريف الارتباط (cookies).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // قد يُستدعى setAll من Server Component؛ يمكن تجاهله
            // إذا كان هناك middleware يتولّى تحديث الجلسة.
          }
        },
      },
    },
  );
}
