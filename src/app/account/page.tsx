import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { LangToggle } from "@/components/lang-toggle";
import { LogoutButton } from "@/components/logout-button";
import { AccountForm } from "./account-form";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

/**
 * تغيير كلمة المرور الذاتي — لأي حساب مسجَّل دخول (مالك، موظّف، أدمِن منصّة)
 * بلا حاجة لجلسة إدارة. يستخدم auth.updateUser على جلسة المستخدم نفسه —
 * لا صلاحيات خاصة، فلا خطر أمني بتوسيعه لكل الحسابات.
 */
export default async function AccountPage() {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/partners?redirect=/account");

  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-16 pt-10 text-center">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <Link href="/dashboard" className="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <LangToggle variant="plain" />
        </div>
        <span className="mx-auto mt-4 block w-fit drop-shadow-[0_14px_30px_rgba(0,0,0,0.55)]">
          <Logo size={56} />
        </span>
        <h1 className="font-serif mt-4 text-3xl font-bold text-[color:var(--ink)]">{tr(lang, "حسابي", "My account")}</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]" dir="ltr">{user.email}</p>
      </header>

      <main className="mx-auto -mt-8 w-full max-w-md flex-1 px-5 pb-12">
        <AccountForm />
        <div className="mt-6 flex justify-center">
          <LogoutButton />
        </div>
      </main>
    </div>
  );
}
