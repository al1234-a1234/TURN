"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

export function AccountForm() {
  const lang = useLang();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);

    if (pw1.length < 8) {
      setError(tr(lang, "كلمة المرور الجديدة يجب أن تكون ٨ أحرف على الأقل.", "New password must be at least 8 characters."));
      return;
    }
    if (pw1 !== pw2) {
      setError(tr(lang, "كلمتا المرور غير متطابقتين.", "The two passwords don't match."));
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updErr } = await supabase.auth.updateUser({ password: pw1 });
    setLoading(false);

    if (updErr) {
      setError(tr(lang, "تعذّر تغيير كلمة المرور. حاول مجددًا.", "Couldn't change the password. Try again."));
      return;
    }

    setOk(true);
    setPw1("");
    setPw2("");
  }

  return (
    <form onSubmit={handleSubmit} className="soft-card space-y-4 p-6">
      {ok && (
        <p className="rounded-2xl border border-[rgba(201,169,97,0.4)] bg-[rgba(201,169,97,0.08)] px-4 py-3 text-sm font-bold text-[color:var(--gold-1)]">
          {tr(lang, "✅ تم تغيير كلمة المرور. اكتب الجديدة في خزنتك الآن.", "✅ Password changed. Write the new one in your vault now.")}
        </p>
      )}
      <div>
        <label htmlFor="pw1" className="field-label">{tr(lang, "كلمة المرور الجديدة", "New password")}</label>
        <input
          id="pw1" type="password" required dir="ltr" autoComplete="new-password"
          value={pw1} onChange={(e) => setPw1(e.target.value)}
          className="field-input text-left" placeholder="••••••••"
        />
      </div>
      <div>
        <label htmlFor="pw2" className="field-label">{tr(lang, "تأكيد كلمة المرور", "Confirm password")}</label>
        <input
          id="pw2" type="password" required dir="ltr" autoComplete="new-password"
          value={pw2} onChange={(e) => setPw2(e.target.value)}
          className="field-input text-left" placeholder="••••••••"
        />
      </div>

      {error && (
        <p className="rounded-2xl border border-[rgba(200,70,70,0.3)] bg-[rgba(200,70,70,0.06)] px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn btn-primary w-full">
        {loading ? tr(lang, "جارٍ الحفظ…", "Saving…") : tr(lang, "تغيير كلمة المرور", "Change password")}
      </button>
    </form>
  );
}
