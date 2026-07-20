"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
  const redirect = searchParams.get("redirect") || "/dashboard";

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
    <div className="bg-hero flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-500 text-white shadow-[var(--shadow-lift)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
            </span>
            <span className="text-2xl font-extrabold text-brand-700 dark:text-brand-300">دور</span>
          </Link>
          <h1 className="mt-5 text-2xl font-extrabold text-brand-900 dark:text-white">
            {mode === "signin" ? "أهلاً بعودتك" : "أنشئ حسابك"}
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            {mode === "signin" ? "سجّل الدخول لمتابعة حجوزاتك" : "ابدأ رحلتك مع دور خلال ثوانٍ"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-7">
          <div>
            <label htmlFor="email" className="field-label">البريد الإلكتروني</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field-input text-left"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="field-label">كلمة المرور</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input text-left"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
              {info}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? "جارٍ المعالجة…" : mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-500">
          {mode === "signin" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setInfo(null);
            }}
            className="font-bold text-brand-600 hover:underline dark:text-brand-400"
          >
            {mode === "signin" ? "أنشئ حسابًا" : "سجّل الدخول"}
          </button>
        </p>
      </div>
    </div>
  );
}
