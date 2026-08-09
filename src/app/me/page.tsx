"use client";

import Link from "next/link";
import { CustomerShell } from "@/components/customer-shell";
import { LangToggle } from "@/components/lang-toggle";
import { IdentityCard } from "./identity-card";
import { RewardsSection, VisitsSection, FavoritesSection } from "./sections";
import { tr } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";



// «حسابي» أحد تبويبَي الشريط السفلي؛ كان الوحيد الذي يذهب للخادم في كل
// ضغطة — لا لبياناتٍ فيه، بل لقراءة كوكي اللغة فقط. صار مكوّن عميل ثابتًا
// فيُجلَب مسبقًا وينتقل إليه الشريط بلا رحلة، كإحساس التطبيقات المثبَّتة.
export default function MePage() {
  const lang = useLang();
  return (
    <CustomerShell active="other" search={false}>
      <div className="space-y-5">
        {/* «مرحبًا بك في EIGHT» كانت ترحيبًا بلا صاحب: يفتحها العميل فلا يرى
            نفسه، ولا يعرف أن دوره محفوظ. وبطاقة الهويّة تقول له اسمه ورقمه
            وما هو حيٌّ له الآن — وهي الفرق بين «موقعٍ زرته» و«حسابٍ لي». */}
        <IdentityCard />

        {/* «كل شيء يخصّ حسابي في مكانٍ واحد» — لا قائمةً تفتح قائمة.
            كانت أربعة روابط تقود إلى أربع صفحات، وكلٌّ منها يسأل عن الرقم
            من جديد. والحساب شيءٌ واحد: من أنا، وما لي الآن، وما جمعتُه. */}
        <RewardsSection />
        <VisitsSection />
        <FavoritesSection />

        <div className="rq-card flex items-center justify-between p-5">
          <span className="font-bold text-[color:var(--ink)]">{tr(lang, "اللغة", "Language")}</span>
          <LangToggle variant="plain" />
        </div>

        <div className="rq-card p-5">
          <p className="font-display text-sm font-bold text-[color:var(--ink)]">{tr(lang, "عندك مطعم؟", "Own a restaurant?")}</p>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">{tr(lang, "انضمّ إلى EIGHT وابدأ بإدارة طابورك وحجوزاتك.", "Join EIGHT and start managing your queue and reservations.")}</p>
          <Link href="/partners" className="rq-btn-soft mt-3 inline-flex">{tr(lang, "بوابة الشركاء ←", "Partners portal ←")}</Link>
        </div>
      </div>
    </CustomerShell>
  );
}
