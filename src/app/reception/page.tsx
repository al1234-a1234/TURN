"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";
import { LangToggle } from "@/components/lang-toggle";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

export default function ReceptionLoginPage() {
  return (
    <Suspense>
      <ReceptionLogin />
    </Suspense>
  );
}

function ReceptionLogin() {
  const lang = useLang();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const user = username.trim().toLowerCase();
    const email = user.includes("@") ? user : `${user}@turn.app`;

    const supabase = createClient();
    const { data: auth, error: signErr } = await supabase.auth.signInWithPassword({ email, password: code });
    if (signErr || !auth.user) {
      setError(tr(lang, "بيانات الدخول غير صحيحة. تأكّد من اسم المستخدم والرمز.", "Invalid login. Check your username and code."));
      setLoading(false);
      return;
    }

    // لا بد أن يكون حساب استقبال فعلاً (صلاحية طابور، أو مدير/مالك) — وإلا فهذا ليس باب الاستقبال
    const { data: staffRows } = await supabase
      .from("staff")
      .select("role, permissions")
      .eq("user_id", auth.user.id)
      .eq("is_active", true);
    const isReception = (staffRows ?? []).some((s) => {
      if (s.role === "owner" || s.role === "manager") return true;
      const perms = (s.permissions ?? {}) as Record<string, boolean>;
      return perms.waitlist === true;
    });
    if (!isReception) {
      await supabase.auth.signOut();
      setError(tr(lang, "هذا ليس حساب استقبال. راجع مالك المطعم.", "This isn't a reception account. Check with the restaurant owner."));
      setLoading(false);
      return;
    }

    // مباشرة إلى شاشة الاستقبال — بلا المرور على لوحة المالك
    router.push("/dashboard/reception");
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-16 pt-10 text-center">
        <div className="mx-auto mb-4 flex max-w-md justify-end">
          <LangToggle variant="plain" />
        </div>
        <span className="mx-auto block w-fit drop-shadow-[0_14px_30px_rgba(0,0,0,0.55)]">
          <Logo size={96} />
        </span>
        <p className="mt-4 text-xs font-bold tracking-[0.35em] text-[color:var(--gold-1)]/80" dir="ltr">
          EIGHT · RECEPTION
        </p>
        {/* فوق العنابي: كريمي الهوية — كان حبرًا داكنًا يكاد يختفي (نفس عطب بوابة الشركاء) */}
        <h1 className="font-serif mt-1 text-3xl font-bold">{tr(lang, "بوابة الاستقبال", "Reception Portal")}</h1>
        <p className="mt-2 text-sm text-cream-200/85">{tr(lang, "دخول موظّف الاستقبال إلى شاشة الطابور مباشرة", "Reception staff sign in straight to the live queue")}</p>
        <div className="gold-rule mx-auto mt-5 max-w-[160px]" />
      </header>

      <main className="mx-auto -mt-8 w-full max-w-md flex-1 px-5">
        <form onSubmit={handleSubmit} className="soft-card space-y-4 p-6">
          <div>
            <label htmlFor="username" className="field-label">{tr(lang, "اسم مستخدم الاستقبال", "Reception username")}</label>
            <input
              id="username" required dir="ltr" autoComplete="username" autoFocus
              value={username} onChange={(e) => setUsername(e.target.value)}
              className="field-input text-left" placeholder="rc4821"
            />
          </div>
          <div>
            <label htmlFor="code" className="field-label">{tr(lang, "الرمز", "Code")}</label>
            <input
              id="code" type="password" required dir="ltr" autoComplete="current-password"
              value={code} onChange={(e) => setCode(e.target.value)}
              className="field-input text-left" placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-2xl border border-[rgba(200,70,70,0.3)] bg-[rgba(200,70,70,0.06)] px-4 py-3 text-sm font-medium text-[color:var(--danger)]">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? tr(lang, "جارٍ الدخول…", "Signing in…") : tr(lang, "دخول الاستقبال", "Reception sign in")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[color:var(--muted)]">
          {tr(lang, "صاحب المطعم؟", "Restaurant owner?")}{" "}
          <a href="/partners" className="font-bold text-[color:var(--gold-1)]">{tr(lang, "بوابة الشركاء", "Partners portal")}</a>
        </p>
      </main>
    </div>
  );
}
