import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClaimForm } from "./claim-form";

export default async function ClaimPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/claim");

  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-14 pt-4">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <Link href="/dashboard" className="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <span className="text-lg font-extrabold">استلام مطعم</span>
          <div className="h-11 w-11" />
        </div>
      </header>

      <main className="mx-auto -mt-8 w-full max-w-xl flex-1 px-5 pb-12">
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-3xl text-white shadow-[var(--shadow-lift)]">
            🔑
          </span>
          <h1 className="mt-4 text-2xl font-extrabold text-brand-800 dark:text-cream-100">
            أدخل رمز التسليم
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[color:var(--muted)]">
            بعد إضافة مطعمك من قِبل فريق دور، ستحصل على رمز خاص. أدخله هنا لتصبح
            المالك وتدير المنيو والصور والطابور.
          </p>
        </div>

        <ClaimForm />

        <p className="mt-6 text-center text-sm text-[color:var(--muted)]">
          ما عندك رمز؟{" "}
          <a href="mailto:albraalaan@gmail.com" className="font-bold text-brand-600 dark:text-brand-300">
            تواصل معنا لإضافة مطعمك
          </a>
        </p>
      </main>
    </div>
  );
}
