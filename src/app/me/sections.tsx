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
 * وكل قسمٍ يظهر ولو خلا. كنتُ أُخفي الخالي كي لا يتكرّر «ما عندك شيء»،
 * فصار الحساب يبدو ناقصًا: يفتحه صاحبه فلا يجد للهدايا أثرًا، فلا يدري
 * أهي غير موجودة أصلًا أم أن شيئًا تعطّل. وسطرٌ هادئ يقول «لسّه ما عندك»
 * أصدق من غياب، ويقول للعميل ما الذي يملأ المكان.
 */

/** سطر القسم الخالي — يقول ما هو، لا «لا شيء» فحسب */
function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="rq-card px-5 py-4">
      <p className="text-[13px] leading-6 text-[color:var(--muted)]">{children}</p>
    </div>
  );
}

/**
 * عنوان قسم — ومعه «الكل» إن كان المعروض بعضًا.
 *
 * القسم يعرض أحدث خمسة أو ستّة، ومن له عشرون زيارة يظنّ أن السبع عشرة
 * الباقية ضاعت. والرابط لا يظهر إلّا حين يكون ثمّة ما يُرى فعلًا.
 */
function SectionTitle({ children, more }: { children: React.ReactNode; more?: string }) {
  const lang = useLang();
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <p className="font-display text-base font-bold text-[color:var(--ink)]">{children}</p>
      {more && (
        <Link href={more} className="text-[13px] font-bold text-[color:var(--muted)]">
          {tr(lang, "الكل ←", "See all ←")}
        </Link>
      )}
    </div>
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
  // الهدايا وحدها تأتي من الخادم — فبين الفتح والوصول لا نقول «ما عندك»:
  // من له هديّة يقرؤها ضياعًا، ثم تظهر. الهيكل يحفظ المكان بلا ادّعاء.
  const [pending, setPending] = useState(true);

  useEffect(() => {
    const p = getMe().phone ? normalizePhone(getMe().phone!).slice(0, 10) : "";
    if (!/^05\d{8}$/.test(p)) { setPending(false); return; }
    let alive = true;
    fetch(`/api/my-rewards?phone=${p}`)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((j) => {
        if (!alive) return;
        setRows((j.rows ?? []) as Reward[]);
        setPending(false);
      })
      .catch(() => alive && setPending(false));
    return () => { alive = false; };
  }, []);

  const active = (rows ?? []).filter((r) => r.status === "active");

  if (pending) {
    return (
      <section>
        <SectionTitle>{tr(lang, "هداياك", "Your gifts")}</SectionTitle>
        <div className="rq-card flex items-center gap-3 p-4" aria-hidden>
          <span className="h-11 w-11 shrink-0 rounded-2xl" style={{ background: "var(--surface-2)" }} />
          <span className="h-4 flex-1 rounded-lg" style={{ background: "var(--surface-2)" }} />
        </div>
      </section>
    );
  }

  if (!active.length) {
    return (
      <section>
        <SectionTitle>{tr(lang, "هداياك", "Your gifts")}</SectionTitle>
        <EmptyLine>
          {tr(
            lang,
            "لسّه ما عندك هدايا. زُر مطاعمك المفضّلة وسجّل زيارتك — والمطعم هو من يهديك.",
            "No gifts yet. Visit your favorite restaurants and check in — the restaurant sends the gifts.",
          )}
        </EmptyLine>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle more="/me/rewards">{tr(lang, "هداياك", "Your gifts")}</SectionTitle>
      <div className="space-y-2">
        {/* البطاقة تُفتح: «استعمال» — وهو ما يجعل الاستقبال يرى الهديّة مع
            دوره — يسكن في صفحة الهدايا. وهديّةٌ تُعرض ولا تُستعمل زينة. */}
        {active.map((r) => (
          <Link key={r.id} href="/me/rewards" className="rq-card flex items-center gap-3 p-4 transition active:scale-[0.99]">
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
          </Link>
        ))}
      </div>
    </section>
  );
}

// ═══ الزيارات ═══
export function VisitsSection() {
  const lang = useLang();
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    const all = getTurns();
    setTotal(all.length);
    setTurns(all.slice(0, 5));
  }, []);
  if (!turns.length) {
    return (
      <section>
        <SectionTitle>{tr(lang, "زياراتك", "Your visits")}</SectionTitle>
        <EmptyLine>
          {tr(
            lang,
            "ما سجّلنا لك زيارة بعد. أوّل دورٍ تأخذه يظهر هنا.",
            "No visits recorded yet. Your first turn will show up here.",
          )}
        </EmptyLine>
      </section>
    );
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-nu-latn", {
      day: "2-digit",
      month: "long",
    });

  return (
    <section>
      <SectionTitle more={total > turns.length ? "/me/visits" : undefined}>
        {tr(lang, "زياراتك", "Your visits")}
      </SectionTitle>
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
  const [total, setTotal] = useState(0);
  useEffect(() => {
    const all = getFavorites();
    setTotal(all.length);
    setFavs(all.slice(0, 6));
  }, []);
  if (!favs.length) {
    return (
      <section>
        <SectionTitle>{tr(lang, "مفضّلتك", "Your favorites")}</SectionTitle>
        <EmptyLine>
          {tr(
            lang,
            "ما أضفت مطعمًا لمفضّلتك. اضغط ♥ في صفحة أيّ مطعم ليصير هنا.",
            "No favorites yet. Tap ♥ on any restaurant page to add it here.",
          )}
        </EmptyLine>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle more={total > favs.length ? "/me/favorites" : undefined}>
        {tr(lang, "مفضّلتك", "Your favorites")}
      </SectionTitle>
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
