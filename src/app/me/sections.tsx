"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMe, getTurns, getFavorites, type TurnRecord, type FavRestaurant } from "@/lib/local-store";
import { normalizePhone, toAr, money } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

/**
 * أقسام الحساب — مفتوحةً في مكانها لا خلف روابط.
 *
 * «كل شيء يخصّ حسابي في مكانٍ واحد، مو بكذا قوائم كثيرة». وكانت أربعة
 * روابط تقود إلى أربع صفحات، وكلٌّ منها يسأل عن الرقم من جديد ويعيد
 * الجلب. والحساب شيءٌ واحد: من أنا، وما لي الآن، وما جمعتُه.
 *
 * وكل قسمٍ يختفي إن خلا: قسمٌ فارغٌ يقول «ما عندك شيء» أربع مرّات يجعل
 * الحساب يبدو خاويًا، وهو ليس كذلك.
 */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 font-display text-base font-bold text-[color:var(--ink)]">{children}</p>
  );
}

// ═══ الهدايا ═══
type Reward = {
  id: string;
  restaurant: string;
  title: string;
  kind: string;
  value: number | null;
  value_kind: string | null;
  status: string;
  expires_at: string | null;
};

export function RewardsSection() {
  const lang = useLang();
  const [rows, setRows] = useState<Reward[] | null>(null);

  useEffect(() => {
    const p = getMe().phone ? normalizePhone(getMe().phone!).slice(0, 10) : "";
    if (!/^05\d{8}$/.test(p)) return;
    let alive = true;
    fetch(`/api/my-rewards?phone=${p}`)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((j) => alive && setRows((j.rows ?? []) as Reward[]));
    return () => { alive = false; };
  }, []);

  const active = (rows ?? []).filter((r) => r.status === "active");
  if (!active.length) return null;

  return (
    <section>
      <SectionTitle>{tr(lang, "هداياك", "Your gifts")}</SectionTitle>
      <div className="space-y-2">
        {active.map((r) => (
          <div key={r.id} className="rq-card flex items-center gap-3 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg" style={{ background: "var(--brand-solid)" }}>
              🎁
            </span>
            <div className="min-w-0 flex-1 text-end">
              <p className="truncate font-bold text-[color:var(--ink)]">{r.title}</p>
              <p className="truncate text-[13px] text-[color:var(--muted)]">
                {r.restaurant}
                {r.value != null && r.kind === "discount"
                  ? ` · ${r.value_kind === "amount" ? money(r.value, lang) : `${toAr(r.value)}٪`}`
                  : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ═══ الزيارات ═══
export function VisitsSection() {
  const lang = useLang();
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  useEffect(() => setTurns(getTurns().slice(0, 5)), []);
  if (!turns.length) return null;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-nu-latn", {
      day: "2-digit",
      month: "long",
    });

  return (
    <section>
      <SectionTitle>{tr(lang, "زياراتك", "Your visits")}</SectionTitle>
      <div className="rq-card divide-y divide-[color:var(--border)] overflow-hidden p-0">
        {turns.map((t, i) => (
          <Link key={`${t.slug}-${i}`} href={`/r/${t.slug}`} className="flex items-center justify-between px-5 py-3.5 transition active:bg-[color:var(--surface-2)]">
            <span className="text-[13px] text-[color:var(--muted)]">{fmt(t.at)}</span>
            <span className="truncate font-bold text-[color:var(--ink)]">{t.name || t.slug}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ═══ المفضّلة ═══
export function FavoritesSection() {
  const lang = useLang();
  const [favs, setFavs] = useState<FavRestaurant[]>([]);
  useEffect(() => setFavs(getFavorites().slice(0, 6)), []);
  if (!favs.length) return null;

  return (
    <section>
      <SectionTitle>{tr(lang, "مفضّلتك", "Your favorites")}</SectionTitle>
      <div className="rq-card divide-y divide-[color:var(--border)] overflow-hidden p-0">
        {favs.map((f) => (
          <Link key={f.slug} href={`/r/${f.slug}`} className="flex items-center justify-between px-5 py-3.5 transition active:bg-[color:var(--surface-2)]">
            <span className="text-[color:var(--muted)]">♥</span>
            <span className="truncate font-bold text-[color:var(--ink)]">{f.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
