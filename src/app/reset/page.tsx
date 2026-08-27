"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";
import { AccountForm } from "../account/account-form";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

/**
 * هبوط رابط «نسيت كلمة المرور» من الإيميل. لا تصلح /account لهذا: حارسها
 * على الخادم يعيد التوجيه قبل أن يبادل المتصفّح رمز الاستعادة (?code=)
 * بجلسة، فيضيع الرمز. هنا صفحة عميل: تبادل الرمز أولًا ثم تعرض نموذج
 * تغيير كلمة المرور نفسه (AccountForm — مصدر واحد).
 */
export default function ResetPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const lang = useLang();
  const [state, setState] = useState<"working" | "ready" | "bad">("working");

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          // ننظّف الرمز من الرابط — استعماله مرتين (ريلود) يفشل ويلخبط
          window.history.replaceState(null, "", "/reset");
          setState("ready");
          return;
        }
      }
      // بلا رمز صالح: لعل الجلسة قائمة أصلًا (رجع للصفحة بعد التبادل)
      const { data: { user } } = await supabase.auth.getUser();
      setState(user ? "ready" : "bad");
    })();
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-16 pt-10 text-center">
        <span className="mx-auto block w-fit drop-shadow-[0_14px_30px_rgba(0,0,0,0.55)]">
          <Logo size={56} />
        </span>
        {/* فوق العنابي: يرث كريمي app-header — كان حبرًا داكنًا يكاد يختفي */}
        <h1 className="font-serif mt-4 text-3xl font-bold">
          {tr(lang, "تعيين كلمة مرور جديدة", "Set a new password")}
        </h1>
      </header>

      <main className="mx-auto -mt-8 w-full max-w-md flex-1 px-5 pb-12">
        {state === "working" && (
          <div className="soft-card p-6 text-center text-sm text-[color:var(--muted)]">
            {tr(lang, "جارٍ التحقق من الرابط…", "Verifying the link…")}
          </div>
        )}
        {state === "ready" && (
          <>
            <AccountForm />
            <p className="mt-4 text-center text-sm text-[color:var(--muted)]">
              {tr(lang, "بعد التغيير:", "After changing:")}{" "}
              <Link href="/dashboard" className="font-bold text-[color:var(--gold-1)]">{tr(lang, "ادخل للوحة ←", "Go to dashboard ←")}</Link>
            </p>
          </>
        )}
        {state === "bad" && (
          <div className="soft-card p-6 text-center">
            <p className="text-sm font-bold text-[color:var(--ink)]">
              {tr(lang, "الرابط انتهت صلاحيته أو استُخدم من قبل.", "This link has expired or was already used.")}
            </p>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              {tr(lang, "اطلب رابطًا جديدًا من صفحة الدخول.", "Request a new link from the sign-in page.")}
            </p>
            <Link href="/partners" className="btn btn-primary mt-4 inline-flex">
              {tr(lang, "صفحة الدخول ←", "Sign-in page ←")}
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
