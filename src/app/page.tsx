import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* شريط التنقّل */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)]/70 bg-[var(--background)]/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="text-xl font-extrabold text-brand-700 dark:text-brand-300">
              دور
            </span>
          </Link>
          <div className="hidden items-center gap-8 text-sm font-semibold text-stone-600 md:flex dark:text-stone-300">
            <a href="#features" className="hover:text-brand-700">المميزات</a>
            <a href="#how" className="hover:text-brand-700">كيف يعمل</a>
            <a href="#owners" className="hover:text-brand-700">للمطاعم</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn btn-ghost h-10 px-4">
              تسجيل الدخول
            </Link>
            <Link href="/dashboard" className="btn btn-primary h-10 px-4">
              أنشئ مطعمك
            </Link>
          </div>
        </nav>
      </header>

      {/* الهيرو */}
      <section className="bg-hero">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <span className="eyebrow">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              منصة الحجوزات وقوائم الانتظار للمطاعم
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.15] text-brand-900 sm:text-5xl md:text-6xl dark:text-white">
              احجز طاولتك،
              <br />
              وتابع دورك
              <span className="relative mx-2 whitespace-nowrap text-brand-600 dark:text-brand-400">
                بلا انتظار
                <Underline />
              </span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-stone-600 dark:text-stone-300">
              تجربة حجز أنيقة وسريعة لعملائك، وقائمة انتظار ذكية لمطعمك —
              بدون طوابير، وبدون رسوم على العميل.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="btn btn-primary px-8 text-base">
                ابدأ الحجز الآن
              </Link>
              <Link href="/dashboard" className="btn btn-ghost px-8 text-base">
                أنا صاحب مطعم
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-6 text-sm text-stone-500">
              <Check text="تأكيد فوري" />
              <Check text="عربي بالكامل" />
              <Check text="بدون رسوم" />
            </div>
          </div>

          {/* بطاقة حجز تجريبية */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-brand-500/10 to-gold-400/20 blur-2xl" />
            <div className="card relative rounded-[1.75rem] p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-lg font-extrabold text-white">
                    م
                  </div>
                  <div>
                    <p className="font-bold">مطعم الأصالة</p>
                    <p className="text-sm text-stone-500">فرع الملقا · الرياض</p>
                  </div>
                </div>
                <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  مؤكّد
                </span>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <MiniStat label="التاريخ" value="الخميس" sub="١ أغسطس" />
                <MiniStat label="الوقت" value="٩:٠٠" sub="مساءً" />
                <MiniStat label="الأشخاص" value="٤" sub="ضيوف" />
              </div>

              <div className="mt-5 rounded-2xl border border-dashed border-[var(--border)] p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-500">دورك في قائمة الانتظار</span>
                  <span className="font-bold text-brand-700 dark:text-brand-300">#٢</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand-200 dark:bg-stone-800">
                  <div className="h-full w-2/3 rounded-full bg-gradient-to-l from-brand-500 to-brand-600" />
                </div>
                <p className="mt-2 text-xs text-stone-500">الوقت المتوقّع: ~١٠ دقائق</p>
              </div>

              <button className="btn btn-gold mt-5 w-full">طاولتك جاهزة 🎉</button>
            </div>
          </div>
        </div>
      </section>

      {/* المميزات */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <SectionHead
          eyebrow="لماذا دور؟"
          title="كل ما يحتاجه مطعمك في مكان واحد"
          subtitle="أدوات بسيطة وأنيقة تجعل إدارة الحجوزات والانتظار متعة."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            icon="📅"
            title="حجوزات مؤكّدة"
            desc="حجز فوري بتأكيد لحظي، مع منع الحجز المزدوج على نفس الطاولة تلقائيًا."
          />
          <Feature
            icon="⏱️"
            title="قائمة انتظار ذكية"
            desc="طابور رقمي منظّم بترتيب واضح وإشعار للعميل عند جاهزية طاولته."
          />
          <Feature
            icon="🎁"
            title="بدون رسوم على العميل"
            desc="تجربة حجز مجانية تمامًا لعملائك — تكسب ثقتهم من أول تجربة."
          />
          <Feature
            icon="🏬"
            title="فروع متعدّدة"
            desc="أدر كل فروعك وطاولاتك من لوحة واحدة بصلاحيات للفريق."
          />
          <Feature
            icon="🌙"
            title="عربي RTL كامل"
            desc="واجهة مصمّمة للعربية من الأساس، بخطوط واضحة واتجاه سليم."
          />
          <Feature
            icon="📊"
            title="لوحة تحكّم فورية"
            desc="تابع الحجوزات القادمة وقائمة الانتظار لحظة بلحظة."
          />
        </div>
      </section>

      {/* كيف يعمل */}
      <section id="how" className="border-y border-[var(--border)] bg-sand-100/60 dark:bg-stone-900/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <SectionHead
            eyebrow="ثلاث خطوات"
            title="من التسجيل إلى أول حجز في دقائق"
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <Step n="١" title="أنشئ مطعمك" desc="سجّل حسابك وأضف مطعمك وفرعك الأول بنقرات." />
            <Step n="٢" title="شارك رابطك" desc="احصل على رابط عام أنيق لمطعمك يحجز منه عملاؤك." />
            <Step n="٣" title="استقبل الحجوزات" desc="تابع الحجوزات والانتظار من لوحتك مباشرةً." />
          </div>
        </div>
      </section>

      {/* دعوة أصحاب المطاعم */}
      <section id="owners" className="mx-auto max-w-6xl px-5 py-20">
        <div className="card relative overflow-hidden rounded-[2rem] bg-brand-700 px-8 py-14 text-center text-white dark:bg-brand-800">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold-400/20 blur-2xl" />
          <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-brand-400/20 blur-2xl" />
          <h2 className="relative text-3xl font-extrabold sm:text-4xl">
            جاهز ترفع تجربة مطعمك؟
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg text-brand-100">
            انضم لمطاعم تدير حجوزاتها بذكاء. الإعداد يستغرق دقائق، والتجربة مجانية للعملاء.
          </p>
          <Link href="/dashboard" className="btn btn-gold relative mt-8 px-10 text-base">
            أنشئ مطعمك مجانًا
          </Link>
        </div>
      </section>

      {/* التذييل */}
      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-extrabold text-brand-700 dark:text-brand-300">دور · Turn</span>
          </div>
          <p className="text-sm text-stone-500">© 2026 دور — جميع الحقوق محفوظة</p>
        </div>
      </footer>
    </div>
  );
}

function Logo() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-brand-500 text-white shadow-[var(--shadow-lift)]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3a9 9 0 1 0 9 9"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    </span>
  );
}

function Underline() {
  return (
    <svg
      className="absolute -bottom-2 right-0 w-full text-gold-400"
      viewBox="0 0 200 12"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M2 9c40-6 156-6 196 0"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Check({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {text}
    </span>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-sand-100 p-3 text-center dark:bg-stone-800/60">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-brand-800 dark:text-brand-200">{value}</p>
      <p className="text-xs text-stone-500">{sub}</p>
    </div>
  );
}

function SectionHead({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="mt-4 text-3xl font-extrabold text-brand-900 sm:text-4xl dark:text-white">
        {title}
      </h2>
      {subtitle && <p className="mt-4 text-lg text-stone-600 dark:text-stone-300">{subtitle}</p>}
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="card group p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-2xl dark:bg-brand-900/40">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mt-2 text-[15px] leading-7 text-stone-600 dark:text-stone-300">{desc}</p>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="card p-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-500 text-2xl font-extrabold text-white shadow-[var(--shadow-lift)]">
        {n}
      </div>
      <h3 className="mt-5 text-lg font-bold">{title}</h3>
      <p className="mt-2 text-[15px] leading-7 text-stone-600 dark:text-stone-300">{desc}</p>
    </div>
  );
}
