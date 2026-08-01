import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * رابط العلامة في رؤوس لوحة التحكم — الشعار + الاسم العربي.
 * الشعار نفسه من `Logo` وحده (LOGO-SPEC.md): لا نسخة ثانية منه في المشروع.
 */
export function BrandLink({
  href = "/",
  size = 38,
  className = "",
}: {
  href?: string;
  size?: number;
  className?: string;
}) {
  return (
    <Link href={href} className={`flex items-center gap-2.5 ${className}`}>
      <Logo size={size} inverted withName={false} />
      <span className="font-display text-lg font-bold text-[color:var(--brand-maroon)]">إيت</span>
    </Link>
  );
}
