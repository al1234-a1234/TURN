import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* هيرو بهيدر متدرّج */}
      <header className="app-header px-5 pb-14 pt-5">
        <nav className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
            </span>
            <span className="text-xl font-extrabold">دور</span>
          </div>
          <Link href="/login" className="icon-btn w-auto gap-1 px-4 text-sm font-bold">
            دخول
          </Link>
        </nav>

        <div className="mx-auto mt-10 max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold backdrop-blur">
            🍽️ قوائم انتظار المطاعم
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
            خذ دورك في مطعمك المفضّل
            <br />
            <span className="text-cream-200">بلا طوابير</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-cream-200/90">
            انضم إلى قائمة الانتظار من جوّالك، اختر المكان وعدد الأشخاص، وتابع دورك لحظة بلحظة.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/restaurants" className="btn btn-cream px-8 text-base">تصفّح المطاعم</Link>
            <Link href="/dashboard" className="btn btn-ghost px-8 text-base">أنا صاحب مطعم</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-6 w-full max-w-3xl flex-1 px-5 pb-16">
        {/* المميزات */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Feature icon="⏱️" title="طابور رقمي" desc="انضم للطابور دون انتظار في المكان." />
          <Feature icon="🪑" title="اختر مكانك" desc="داخلي أو خارجي، وعدد الكراسي المناسب." />
          <Feature icon="🔔" title="تابع دورك" desc="اعرف ترتيبك ويصلك تنبيه عند اقترابه." />
        </div>

        {/* كيف يعمل */}
        <div className="soft-card mt-6 p-6">
          <h2 className="mb-5 text-center text-xl font-extrabold text-brand-800 dark:text-cream-100">
            كيف يعمل؟
          </h2>
          <div className="grid gap-5 sm:grid-cols-3">
            <Step n="١" title="اختر المطعم" desc="تصفّح المطاعم واختر فرعك." />
            <Step n="٢" title="انضم للطابور" desc="حدّد المنطقة وعدد الأشخاص." />
            <Step n="٣" title="تابع دورك" desc="اعرف ترتيبك واحضر في وقتك." />
          </div>
        </div>

        <div className="soft-card mt-6 flex flex-col items-center gap-4 bg-brand-700 p-8 text-center text-white">
          <h2 className="text-2xl font-extrabold">مطعمك يستقبل زحامًا؟</h2>
          <p className="max-w-md text-cream-200/90">
            أدر قائمة انتظارك بذكاء من لوحة واحدة. الإعداد دقائق، والتجربة مجانية لعملائك.
          </p>
          <Link href="/dashboard" className="btn btn-cream px-8">أنشئ مطعمك مجانًا</Link>
        </div>
      </main>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto max-w-3xl px-5 py-6 text-center text-sm text-[color:var(--muted)]">
          © 2026 دور — جميع الحقوق محفوظة
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="soft-card p-5 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-2xl dark:bg-brand-900/40">
        {icon}
      </div>
      <h3 className="mt-3 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-[color:var(--muted)]">{desc}</p>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 to-brand-500 text-lg font-extrabold text-white shadow-[var(--shadow-lift)]">
        {n}
      </div>
      <h3 className="mt-3 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-[color:var(--muted)]">{desc}</p>
    </div>
  );
}
