import { cookies } from "next/headers";
import type { Lang } from "./i18n";

/** قراءة اللغة من الكوكيز (الخادم). الافتراضي عربي. */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return store.get("lang")?.value === "en" ? "en" : "ar";
}
