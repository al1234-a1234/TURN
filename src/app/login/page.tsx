"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/brand";

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

  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // اسم المستخدم يتحوّل لبريد داخلي، أو استخدم الإيميل مباشرة
    const id = identifier.trim().toLowerCase();
    const email = id.includes("@") ? id : `${id}@turn.app`;

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: code });
    if (error) {
      setError("بيانات الدخول غير صحيحة. تأكّد من اسم المستخدم والرمز.");
      setLoading(false);
      return;
    }
    router.push(redirect);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-16 pt-10 text-center">
        <span className="mx-auto block w-fit drop-shadow-[0_14px_30px_rgba(0,0,0,0.55)]">
          <BrandMark size={72} />
        </span>
        <h1 className="font-serif mt-5 text-3xl font-bold text-[color:var(--ink)]">دخول أصحاب المطاعم</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">ادخل باسم المستخدم والرمز اللذين زوّدك بهما فريق دور</p>
        <div className="gold-rule mx-auto mt-5 max-w-[160px]" />
      </header>

      <main className="mx-auto -mt-8 w-full max-w-md flex-1 px-5">
        <form onSubmit={handleSubmit} className="soft-card space-y-4 p-6">
          <div>
            <label htmlFor="identifier" className="field-label">اسم المستخدم</label>
            <input
              id="identifier" required autoComplete="username" dir="ltr"
              value={identifier} onChange={(e) => setIdentifier(e.target.value)}
              className="field-input text-left" placeholder="aldeyafa"
            />
          </div>
          <div>
            <label htmlFor="code" className="field-label">الرمز</label>
            <input
              id="code" type="password" required autoComplete="current-password" dir="ltr"
              value={code} onChange={(e) => setCode(e.target.value)}
              className="field-input text-left" placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-2xl border border-[rgba(220,90,90,0.35)] bg-[color:var(--surface)] px-4 py-3 text-sm font-medium text-red-300">{error}</p>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? "جارٍ الدخول…" : "دخول"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[color:var(--muted)]">
          تبي تضيف مطعمك؟{" "}
          <a href="mailto:albraalaan@gmail.com" className="font-bold text-[color:var(--gold-1)]">تواصل مع إدارة دور</a>
        </p>
      </main>
    </div>
  );
}
