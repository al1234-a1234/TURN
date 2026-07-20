"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/brand";

type Mode = "signin" | "signup";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/restaurants";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError("تعذّر تسجيل الدخول. تحقّق من البريد وكلمة المرور.");
        setLoading(false);
        return;
      }
      router.push(redirect);
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError("تعذّر إنشاء الحساب. حاول ببريد آخر أو كلمة مرور أقوى.");
        setLoading(false);
        return;
      }
      if (!data.session) {
        setInfo("تم إنشاء الحساب. تحقّق من بريدك لتأكيد الحساب ثم سجّل الدخول.");
        setMode("signin");
        setLoading(false);
        return;
      }
      router.push(redirect);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-16 pt-10 text-center">
        <span className="mx-auto block w-fit">
          <BrandMark size={68} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold">
          {mode === "signin" ? "أهلاً بعودتك" : "أنشئ حسابك"}
        </h1>
        <p className="mt-1 text-sm text-cream-200/85">
          {mode === "signin" ? "سجّل الدخول لمتابعة دورك" : "ابدأ مع دور خلال ثوانٍ"}
        </p>
      </header>

      <main className="mx-auto -mt-8 w-full max-w-md flex-1 px-5">
        <form onSubmit={handleSubmit} className="soft-card space-y-4 p-6">
          <div>
            <label htmlFor="email" className="field-label">البريد الإلكتروني</label>
            <input
              id="email" type="email" required autoComplete="email" dir="ltr"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="field-input text-left" placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="field-label">كلمة المرور</label>
            <input
              id="password" type="password" required minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)}
              className="field-input text-left" placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>
          )}
          {info && (
            <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">{info}</p>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? "جارٍ المعالجة…" : mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[color:var(--muted)]">
          {mode === "signin" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
          <button
            type="button"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setInfo(null); }}
            className="font-bold text-brand-600 hover:underline"
          >
            {mode === "signin" ? "أنشئ حسابًا" : "سجّل الدخول"}
          </button>
        </p>
      </main>
    </div>
  );
}
