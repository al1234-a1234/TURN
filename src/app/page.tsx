export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col items-center gap-8 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-4 py-1.5 text-sm font-medium text-teal-700 ring-1 ring-teal-600/20 dark:bg-teal-950/40 dark:text-teal-300">
          🍽️ قريبًا — منصة المطاعم
        </span>

        <h1 className="text-5xl font-extrabold tracking-tight text-teal-700 sm:text-6xl dark:text-teal-400">
          دور
          <span className="ms-3 align-middle text-3xl font-bold text-zinc-400 sm:text-4xl">
            Turn
          </span>
        </h1>

        <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-300">
          احجز طاولتك في مطعمك المفضّل وتابع دورك في قائمة الانتظار لحظة بلحظة —
          بدون طوابير، وبدون انتظار على الهاتف.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <a
            href="#"
            className="flex h-12 items-center justify-center rounded-full bg-teal-600 px-8 font-semibold text-white transition-colors hover:bg-teal-700"
          >
            ابدأ الحجز
          </a>
          <a
            href="#"
            className="flex h-12 items-center justify-center rounded-full border border-zinc-300 px-8 font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            للمطاعم
          </a>
        </div>
      </main>

      <footer className="mt-16 text-sm text-zinc-400">
        © {new Date().getFullYear()} دور · Turn — جميع الحقوق محفوظة
      </footer>
    </div>
  );
}
