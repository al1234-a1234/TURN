import Link from "next/link";
import { BrandMark } from "@/components/brand";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-gradient-to-b from-brand-600 to-brand-800 text-white">
      {/* شريط علوي بسيط */}
      <nav className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-5">
        <span className="text-sm font-bold tracking-[0.3em] text-cream-200/80" dir="ltr">TURN</span>
        <Link href="/login" className="icon-btn w-auto gap-1 px-4 text-sm font-bold">
          دخول
        </Link>
      </nav>

      {/* الهوية في المنتصف */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
        <BrandMark size={128} />
        <h1 className="mt-6 text-5xl font-extrabold tracking-[0.15em] text-white" dir="ltr">
          TURN
        </h1>
        <p className="mt-1 text-2xl font-extrabold text-cream-200">دور</p>
        <p className="mt-4 text-cream-200/80">خذ دورك في مطعمك المفضّل — بلا طوابير.</p>

        <div className="mt-10 w-full space-y-3">
          <Link href="/restaurants" className="btn btn-cream w-full text-base">
            تصفّح المطاعم وخذ دورك
          </Link>
          <Link href="/login" className="btn btn-ghost w-full border-white/25 bg-white/10 text-white text-base hover:bg-white/20">
            دخول أصحاب المطاعم
          </Link>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-5 pb-6 text-center text-xs text-cream-200/60" dir="ltr">
        © 2026 TURN · دور
      </footer>
    </div>
  );
}
