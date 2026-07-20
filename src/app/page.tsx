import Link from "next/link";
import { BrandMark } from "@/components/brand";

const HERO =
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=1400&auto=format&fit=crop";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* خلفية أجواء مطعم راقٍ */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={HERO}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      {/* تدرّج أخضر غامق لقراءة النص */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0c1712]/50 via-[#0c1712]/72 to-[#0c1712]" />
      <div className="absolute inset-0 bg-[#0c1712]/20" />

      {/* زر دخول علوي زجاجي صغير */}
      <nav className="relative z-10 mx-auto flex w-full max-w-[420px] items-center justify-between px-6 pt-6">
        <span className="font-serif text-lg font-semibold tracking-[0.3em] text-[color:var(--gold-1)]/80" dir="ltr">
          TURN
        </span>
        <Link href="/login" className="icon-btn h-10 w-10" aria-label="دخول">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
            <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </Link>
      </nav>

      {/* عمود المحتوى في المنتصف */}
      <main className="relative z-10 mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center px-6 pb-6 text-center">
        <div className="reveal drop-shadow-[0_18px_40px_rgba(0,0,0,0.6)]" style={{ animationDelay: "0ms" }}>
          <BrandMark size={100} />
        </div>

        <h1
          className="reveal font-serif mt-8 text-7xl font-bold leading-none text-[color:var(--ink)]"
          style={{ animationDelay: "90ms", letterSpacing: "0.15em", textIndent: "0.15em" }}
          dir="ltr"
        >
          TURN
        </h1>
        <p
          className="reveal font-ar text-gold mt-3 text-4xl font-bold"
          style={{ animationDelay: "170ms" }}
        >
          دور
        </p>

        <p
          className="reveal mt-5 max-w-[300px] leading-8 text-[color:var(--muted)]"
          style={{ animationDelay: "250ms" }}
        >
          تجربة انتظار راقية لأفخم المطاعم — خذ دورك، وتابع طابورك بأناقة.
        </p>

        {/* خط ذهبي فاصل */}
        <div className="reveal gold-rule my-8 max-w-[220px]" style={{ animationDelay: "320ms" }} />

        {/* الأزرار داخل كرت زجاجي */}
        <div
          className="reveal glass w-full space-y-3 p-4"
          style={{ animationDelay: "390ms" }}
        >
          <Link href="/restaurants" className="btn btn-primary w-full text-base">
            تصفّح المطاعم وخذ دورك
          </Link>
          <Link href="/login" className="btn btn-secondary w-full text-base">
            دخول أصحاب المطاعم
          </Link>
        </div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-[420px] px-6 pb-6 text-center text-xs tracking-widest text-[color:var(--muted)]/70" dir="ltr">
        TURN · دور
      </footer>
    </div>
  );
}
