import Link from "next/link";
import { BrandMark } from "@/components/brand";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-[color:var(--bg)] text-[color:var(--foreground)]">
      {/* شريط علوي: زر دخول واضح */}
      <nav className="mx-auto flex w-full max-w-md items-center justify-between px-5 pt-5">
        <span className="text-sm font-bold tracking-[0.3em] text-[color:var(--muted)]" dir="ltr">
          TURN
        </span>
        <Link
          href="/login"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[color:var(--surface)] px-4 text-sm font-bold"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
            <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          دخول
        </Link>
      </nav>

      {/* الهوية في المنتصف بإيقاع منتظم (24px بين المجموعات) */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 text-center">
        <BrandMark size={120} />

        <div className="mt-6 space-y-1">
          <h1 className="text-5xl font-extrabold tracking-[0.16em] text-[color:var(--foreground)]" dir="ltr">
            TURN
          </h1>
          <p className="text-2xl font-extrabold text-cream">دور</p>
        </div>

        <p className="mt-6 leading-7 text-[color:var(--muted)]">
          خذ دورك في مطعمك المفضّل — بلا طوابير.
        </p>

        <div className="mt-8 w-full space-y-3">
          <Link href="/restaurants" className="btn btn-primary w-full text-base">
            تصفّح المطاعم وخذ دورك
          </Link>
          <Link href="/login" className="btn btn-secondary w-full text-base">
            دخول أصحاب المطاعم
          </Link>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-md px-5 pb-6 text-center text-xs text-[color:var(--muted)]" dir="ltr">
        © 2026 TURN · دور
      </footer>
    </div>
  );
}
