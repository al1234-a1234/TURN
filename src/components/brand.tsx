import Link from "next/link";

/**
 * شعار TURN الرسمي (الأيقونة الحقيقية) + الاسم العربي.
 * يُستخدم في الهيدر وصفحات الدخول لهوية موحّدة.
 */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/10 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.5)] ring-1 ring-white/20"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/turn-logo.png" alt="TURN" className="h-full w-full object-cover" />
    </span>
  );
}

export function BrandLink({
  href = "/",
  size = 40,
  className = "",
}: {
  href?: string;
  size?: number;
  className?: string;
}) {
  return (
    <Link href={href} className={`flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="text-lg font-extrabold">دور</span>
        <span className="text-[10px] font-bold tracking-[0.35em] text-cream-200/80" dir="ltr">
          TURN
        </span>
      </span>
    </Link>
  );
}
