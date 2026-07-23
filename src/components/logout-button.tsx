"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

export function LogoutButton() {
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
      className="flex h-10 items-center rounded-full bg-white/15 px-4 text-sm font-bold text-white backdrop-blur transition hover:bg-white/25"
    >
      {tr(lang, "تسجيل الخروج", "Log out")}
    </button>
  );
}
