"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";
import { LangToggle } from "@/components/lang-toggle";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

export default function PartnersPage() {
  return (
    <Suspense>
      <PartnersLogin />
    </Suspense>
  );
}

function PartnersLogin() {
  const lang = useLang();
  const router = useRouter();
  const params = useSearchParams();
  // مسار داخلي فقط (يبدأ بـ "/" وليس "//") — لمنع إعادة التوجيه لموقع خارجي
  const redirectRaw = params.get("redirect") ?? "";
  const redirect = /^\/(?!\/)/.test(redirectRaw) ? redirectRaw : "/dashboard";

  const [restaurantId, setRestaurantId] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  /** استعادة ذاتية لكلمة المرور — بلا هذي كان الناسي يرجع للأدمِن (تبعية). */
  async function handleForgot() {
    setError(null);
    setResetMsg(null);
    const user = username.trim().toLowerCase();
    if (!user) {
      setResetMsg(tr(lang, "اكتب اسم المستخدم (الإيميل) فوق أولًا، ثم اضغط «نسيت كلمة المرور».", "Enter your username (email) above first, then tap “Forgot password”."));
      return;
    }
    if (!user.includes("@")) {
      // حسابات بلا إيميل حقيقي (اسم مستخدم داخلي) لا يصلها بريد أصلًا
      setResetMsg(tr(lang, "حسابك باسم مستخدم داخلي بلا إيميل — يعيد تعيينه مالك المطعم من صفحة «الموظفون»، أو إدارة إيت.", "Your account uses an internal username without an email — the restaurant owner can reset it from the Staff page, or the EIGHT team."));
      return;
    }
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(user, {
      redirectTo: `${window.location.origin}/reset`,
    });
    // نفس الرسالة وُجد الحساب أو لا — لا نكشف أي الإيميلات مسجَّلة عندنا
    setResetMsg(tr(lang, "إن كان الإيميل مسجَّلًا عندنا وصلك رابط تعيين كلمة مرور جديدة — افحص الوارد والمزعج.", "If this email is registered, a reset link is on its way — check your inbox and spam."));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const rid = restaurantId.trim().toLowerCase();
    const user = username.trim().toLowerCase();
    const email = user.includes("@") ? user : `${user}@turn.app`;

    const supabase = createClient();
    const { data: auth, error: signErr } = await supabase.auth.signInWithPassword({
      email,
      password: code,
    });
    if (signErr || !auth.user) {
      setError(tr(lang, "بيانات الدخول غير صحيحة. تأكّد من اسم المستخدم وكلمة المرور.", "Invalid login. Check your username and password."));
      setLoading(false);
      return;
    }

    // تحقّق أن مُعرّف المطعم يطابق مطعم هذا المالك (يتجاوزه الأدمِن)
    const { data: isAdmin } = await supabase.rpc("is_platform_admin");
    if (!isAdmin) {
      const { data: staffRows } = await supabase
        .from("staff")
        .select("restaurants(slug)")
        .eq("user_id", auth.user.id)
        .eq("is_active", true);
      const slugs = (staffRows ?? [])
        .map((s) => {
          const r = Array.isArray(s.restaurants) ? s.restaurants[0] : s.restaurants;
          return (r as { slug?: string } | null)?.slug;
        })
        .filter(Boolean) as string[];
      if (rid && !slugs.includes(rid)) {
        await supabase.auth.signOut();
        setError(tr(lang, "مُعرّف المطعم لا يطابق حسابك.", "The restaurant ID doesn't match your account."));
        setLoading(false);
        return;
      }
    }

    router.push(redirect);
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
          EIGHT PARTNERS
        </p>
        <h1 className="font-serif mt-1 text-3xl font-bold text-[color:var(--ink)]">{tr(lang, "بوابة الشركاء", "Partners Portal")}</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">{tr(lang, "دخول أصحاب المطاعم ببيانات الإدارة", "Restaurant owners sign in with their admin credentials")}</p>
        <div className="gold-rule mx-auto mt-5 max-w-[160px]" />
      </header>

      <main className="mx-auto -mt-8 w-full max-w-md flex-1 px-5">
        <form onSubmit={handleSubmit} className="soft-card space-y-4 p-6">
          <div>
            <label htmlFor="rid" className="field-label">{tr(lang, "مُعرّف المطعم (Restaurant ID)", "Restaurant ID")}</label>
            <input
              id="rid" required dir="ltr" autoComplete="off"
              value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)}
              className="field-input text-left" placeholder="my-restaurant"
            />
          </div>
          <div>
            <label htmlFor="username" className="field-label">{tr(lang, "اسم المستخدم", "Username")}</label>
            <input
              id="username" required dir="ltr" autoComplete="username"
              value={username} onChange={(e) => setUsername(e.target.value)}
              className="field-input text-left" placeholder="aldeyafa"
            />
          </div>
          <div>
            <label htmlFor="code" className="field-label">{tr(lang, "كلمة المرور", "Password")}</label>
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
          {resetMsg && (
            <p className="rounded-2xl border border-[rgba(201,169,97,0.4)] bg-[rgba(201,169,97,0.08)] px-4 py-3 text-sm font-medium text-[color:var(--ink)]">
              {resetMsg}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? tr(lang, "جارٍ الدخول…", "Signing in…") : tr(lang, "دخول", "Sign in")}
          </button>

          <button type="button" onClick={handleForgot} className="w-full text-center text-sm font-bold text-[color:var(--muted)] underline underline-offset-4">
            {tr(lang, "نسيت كلمة المرور؟", "Forgot password?")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[color:var(--muted)]">
          {tr(lang, "تبي تضيف مطعمك؟", "Want to add your restaurant?")}{" "}
          <a href="mailto:albraalaan@gmail.com" className="font-bold text-[color:var(--gold-1)]">{tr(lang, "تواصل مع إدارة إيت", "Contact the EIGHT team")}</a>
        </p>
      </main>
    </div>
  );
}
