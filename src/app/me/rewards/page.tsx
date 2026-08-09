"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CustomerShell } from "@/components/customer-shell";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/components/lang-provider";
import { tr } from "@/lib/i18n";
import { toAr, money, normalizePhone } from "@/lib/format";
import { getMe, saveMe } from "@/lib/local-store";

/**
 * هدايا الزبون — المكان الوحيد الذي يرى فيه هديّة.
 *
 * الهوية هنا الرقم لا الحساب: كل عملاء المنتج ضيوف تُنشأ صفوفهم من
 * الانضمام للطابور بلا حساب، والنسخة السابقة (my_rewards على auth.uid)
 * ما كانت لتُظهر هدية لأحد. القراءة والتسليح عبر RPC محدودة المعدّل.
 *
 * «استعمال» تسلّح الهدية فتظهر للاستقبال مع دوره — ولا تصرفها. الصرف
 * بيد الموظّف وحده، و«تراجع» تفكّها.
 */

type Reward = {
  id: string;
  restaurant: string;
  restaurant_slug: string;
  kind: string;
  title: string;
  value: number | null;
  value_kind: string | null;
  description: string | null;
  status: string;
  armed_at: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
};

export default function MyRewardsPage() {
  const lang = useLang();
  const [phone, setPhone] = useState("");
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookupErr, setLookupErr] = useState(false);
  const [armErr, setArmErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();

  const runLookup = useCallback(async (p: string) => {
    if (!/^05\d{8}$/.test(p)) { setLookupErr(!!p); return; }
    setLookupErr(false);
    setLoading(true);
    try {
      // في مخزن الهويّة المشترك لا في مفتاحٍ خاصّ بهذه الصفحة
      saveMe({ phone: p });
      const res = await fetch(`/api/my-rewards?phone=${p}`);
      const j = res.ok ? await res.json() : { rows: [] };
      setRewards((j.rows ?? []) as Reward[]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ‏«turn:phone» كان مفتاحًا خاصًّا بهذه الصفحة وحدها — ورقمُ العميل يُحفظ
  // عند أخذ الدور في مخزن الهويّة (`getMe`). فكانت الصفحة لا ترى رقمًا
  // موجودًا وتسأل عنه من جديد، وكأنّه لم يستعمل التطبيق قطّ.
  useEffect(() => {
    const saved = getMe().phone ? normalizePhone(getMe().phone!).slice(0, 10) : "";
    if (/^05\d{8}$/.test(saved)) { setPhone(saved); runLookup(saved); }
    else setEditing(true);
  }, [runLookup]);

  /** تسليح/فكّ — والقاعدة هي الحكم: فشلها يظهر رسالة ويعيد التحميل */
  const toggleArm = (r: Reward) => {
    const next = !r.armed_at;
    setBusyId(r.id);
    setArmErr(null);
    startTransition(async () => {
      const supabase = createClient();
      const { data: ok, error } = await supabase.rpc("set_reward_armed_by_phone", {
        p_reward_id: r.id, p_phone: phone, p_arm: next,
      });
      if (ok && !error) {
        setRewards((prev) =>
          (prev ?? []).map((x) => (x.id === r.id ? { ...x, armed_at: next ? new Date().toISOString() : null } : x)),
        );
      } else {
        setArmErr(tr(lang, "تعذّر التحديث — جرّب بعد لحظات.", "Couldn't update — try again shortly."));
        await runLookup(phone);
      }
      setBusyId(null);
    });
  };

  const valueLabel = (r: Reward) =>
    r.kind === "discount" && r.value != null
      ? r.value_kind === "amount" ? money(r.value, lang) : `${toAr(r.value)}${lang === "en" ? "%" : "٪"}`
      : "";
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-nu-latn", { day: "2-digit", month: "short" }) : "";

  const active = (rewards ?? []).filter((r) => r.status === "active");
  const used = (rewards ?? []).filter((r) => r.status === "redeemed");

  return (
    <CustomerShell active="other" search={false}>
      <div className="space-y-5">
        {/* رقمه معروف ⇒ لا نموذج ولا سطر: بطاقة الحساب تقوله مرّةً */}
        {!editing && /^05\d{8}$/.test(phone) ? null : (
        <div className="rq-card p-5">
          <p className="font-display text-lg font-bold text-[color:var(--ink)]">{tr(lang, "هداياك", "Your gifts")}</p>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">
            {tr(lang, "محفوظة على رقم جوّالك — أدخله لعرضها.", "Saved to your mobile number — enter it to view.")}
          </p>
          {lookupErr && (
            <p className="mt-2 text-xs font-bold text-[color:var(--danger)]">
              {tr(lang, "رقم الجوّال غير مكتمل — يبدأ بـ 05 ويتكوّن من 10 خانات.", "Incomplete number — starts with 05, 10 digits.")}
            </p>
          )}
          <form onSubmit={(e) => { e.preventDefault(); runLookup(phone.trim()); }} className="mt-3 flex gap-2">
            <input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 10))} placeholder="05xxxxxxxx" className="field-input flex-1 text-left" />
            <button type="submit" disabled={loading} className="rq-btn shrink-0 px-5">{loading ? "…" : tr(lang, "عرض", "Show")}</button>
          </form>
        </div>
        )}

        {armErr && (
          <p className="rounded-2xl bg-[color:var(--surface-2)] px-4 py-2.5 text-center text-xs font-bold text-[color:var(--danger)]">{armErr}</p>
        )}

        {rewards !== null && active.length === 0 && used.length === 0 && (
          <div className="rq-card p-10 text-center text-[color:var(--muted)]">
            <span className="text-4xl">🎁</span>
            <p className="mt-3 text-sm">{tr(lang, "لا توجد هدايا على هذا الرقم حاليًا.", "No gifts on this number yet.")}</p>
          </div>
        )}

        {active.length > 0 && (
          <div className="space-y-2.5">
            <p className="px-1 font-display text-base font-bold text-[color:var(--ink)]">
              🎁 {tr(lang, "هدايا تقدر تستعملها", "Gifts you can use")}
              <span className="ms-2 text-xs font-bold text-[color:var(--muted)]">{toAr(active.length)}</span>
            </p>

            {active.map((r) => {
              const armed = !!r.armed_at;
              return (
                <div key={r.id} className="rq-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl text-cream-100" style={{ background: "var(--brand-solid)" }}>
                      {r.kind === "discount" ? "٪" : "🎁"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[16px] font-bold text-[color:var(--ink)]">
                        {r.title}{valueLabel(r) ? ` · ${valueLabel(r)}` : ""}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] font-medium text-[color:var(--muted)]">
                        {r.restaurant}{r.expires_at ? ` · ${tr(lang, "ينتهي", "ends")} ${fmtDate(r.expires_at)}` : ""}
                      </p>
                    </div>
                  </div>

                  {r.description && (
                    <p className="mt-2 rounded-2xl bg-[color:var(--surface-2)] px-3 py-2 text-sm text-[color:var(--ink)]">{r.description}</p>
                  )}

                  {armed ? (
                    <div className="mt-3 space-y-2">
                      <p className="rounded-2xl px-3 py-2.5 text-center text-xs font-bold text-cream-100" style={{ background: "var(--brand-solid)" }}>
                        ✓ {tr(lang, "جاهزة — خذ دورك وبتظهر للموظّف", "Ready — take your turn and staff will see it")}
                      </p>
                      <div className="flex gap-2">
                        <Link href={`/r/${r.restaurant_slug}`} className="rq-btn flex-1">{tr(lang, "خذ دورك", "Take your turn")}</Link>
                        <button type="button" onClick={() => toggleArm(r)} disabled={busyId === r.id} className="btn btn-ghost shrink-0 px-4">
                          {busyId === r.id ? "…" : tr(lang, "تراجع", "Undo")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => toggleArm(r)} disabled={busyId === r.id} className="rq-btn mt-3 w-full">
                      {busyId === r.id ? "…" : tr(lang, "استعمال", "Use")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {used.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-bold text-[color:var(--muted)]">{tr(lang, "مستخدمة سابقًا", "Previously used")}</p>
            <div className="space-y-2">
              {used.map((r) => (
                <div key={r.id} className="rq-card flex items-center gap-3 p-3.5 opacity-70">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--surface-2)] text-lg">✓</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[color:var(--ink)] line-through">{r.title}</p>
                    <p className="text-xs text-[color:var(--muted)]">{r.restaurant} · {tr(lang, "استُخدمت", "used")} {fmtDate(r.redeemed_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </CustomerShell>
  );
}
