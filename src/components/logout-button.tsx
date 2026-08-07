"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

/**
 * `variant`:
 *  - `header` — أبيض شفّاف، للترويسات العنابية (الأدمن والشركاء).
 *  - `plain`  — على سطحٍ فاتح (درج المالك). الأبيض الشفّاف هناك يختفي.
 */
export function LogoutButton({ variant = "header" }: { variant?: "header" | "plain" }) {
  const lang = useLang();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/partners");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className={
        variant === "plain"
          ? "w-full rounded-2xl py-3 text-[15px] font-bold transition active:scale-[0.99]"
          : "flex h-10 items-center rounded-full bg-white/15 px-4 text-sm font-bold text-cream-100 backdrop-blur transition hover:bg-white/25"
      }
      style={
        variant === "plain"
          ? { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--danger)" }
          : undefined
      }
    >
      {tr(lang, "تسجيل الخروج", "Log out")}
    </button>
  );
}
