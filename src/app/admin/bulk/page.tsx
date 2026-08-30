import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BulkForm } from "./bulk-form";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { ScreenGuide } from "@/components/screen-guide";

export const dynamic = "force-dynamic";

export default async function BulkPage() {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/partners?redirect=/admin/bulk");

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-12 pt-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/admin" className="icon-btn" aria-label={tr(lang, "رجوع", "Back")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <span className="text-lg font-extrabold">{tr(lang, "إدخال بالجملة", "Bulk onboarding")}</span>
          <span className="h-10 w-10" />
        </div>
      </header>

      <main className="mx-auto -mt-4 w-full max-w-3xl flex-1 space-y-4 px-5 pb-12">
        <ScreenGuide
          lang={lang}
          anchor="owner"
          lines={[
            tr(lang, "شاشة فريق «دور» وحده — إدخال عدّة مطاعمَ دفعةً واحدة.", "The Turn team's screen only — onboard several restaurants in one pass."),
            tr(lang, "كلّ مطعمٍ يخرج جاهزًا للطابور فورًا بحساب مالكه.", "Each restaurant comes out queue-ready at once, with its owner account."),
            tr(lang, "الشعار والمنيو والطاولات تُترك للمالك يضيفها لاحقًا.", "Logo, menu and tables are deliberately left for the owner to add later."),
          ]}
        />
        <div className="soft-card p-4 text-sm text-[color:var(--muted)]">
          {tr(
            lang,
            "المطعم الجديد جاهزٌ للطابور فور إنشائه: مفتوحٌ دائمًا، يقبل الانضمام، وله قسمان داخلي وخارجي وحساب مالك وكلّ الميزات. والشعار والقائمة والطاولات يضيفها المالك بنفسه لاحقًا.",
            "A new restaurant is queue-ready immediately: always open, accepting joins, with inside/outside zones, an owner account, and every feature on. Logo, menu and tables are added later by the owner.",
          )}
        </div>
        <BulkForm />
      </main>
    </div>
  );
}
