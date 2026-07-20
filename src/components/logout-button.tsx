"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
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
      تسجيل الخروج
    </button>
  );
}
