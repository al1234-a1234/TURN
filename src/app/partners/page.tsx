"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/brand";

export default function PartnersPage() {
  return (
    <Suspense>
      <PartnersLogin />
    </Suspense>
  );
}

function PartnersLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/dashboard";

  const [restaurantId, setRestaurantId] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("بيانات الدخول غير صحيحة. تأكّد من اسم المستخدم وكلمة المرور.");
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
        setError("مُعرّف المطعم لا يطابق حسابك.");
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
        <span className="mx-auto block w-fit drop-shadow-[0_14px_30px_rgba(0,0,0,0.55)]">
          <BrandMark size={72} />
        </span>
        <p className="mt-4 text-xs font-bold tracking-[0.35em] text-[color:var(--gold-1)]/80" dir="ltr">
          TURN PARTNERS
        </p>
        <h1 className="font-serif mt-1 text-3xl font-bold text-[color:var(--ink)]">بوابة الشركاء</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">دخول أصحاب المطاعم ببيانات الإدارة</p>
        <div className="gold-rule mx-auto mt-5 max-w-[160px]" />
      </header>

      <main className="mx-auto -mt-8 w-full max-w-md flex-1 px-5">
        <form onSubmit={handleSubmit} className="soft-card space-y-4 p-6">
          <div>
            <label htmlFor="rid" className="field-label">مُعرّف المطعم (Restaurant ID)</label>
            <input
              id="rid" required dir="ltr" autoComplete="off"
              value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)}
              className="field-input text-left" placeholder="my-restaurant"
            />
          </div>
          <div>
            <label htmlFor="username" className="field-label">اسم المستخدم</label>
            <input
              id="username" required dir="ltr" autoComplete="username"
              value={username} onChange={(e) => setUsername(e.target.value)}
              className="field-input text-left" placeholder="aldeyafa"
            />
          </div>
          <div>
            <label htmlFor="code" className="field-label">كلمة المرور</label>
            <input
              id="code" type="password" required dir="ltr" autoComplete="current-password"
              value={code} onChange={(e) => setCode(e.target.value)}
              className="field-input text-left" placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-2xl border border-[rgba(220,90,90,0.35)] bg-[color:var(--surface)] px-4 py-3 text-sm font-medium text-red-300">
              {error}
            </p>
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
