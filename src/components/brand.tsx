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
      {/* لا كلمة بجانب الشعار: اللوح نفسه يحمل «8 / EIGHT»، فتكرارها حشو.
          وكانت مكتوبةً بالعربية يدويًّا فتبقى عربيةً في الوضع الإنجليزي. */}
      <Logo size={size} withName={false} />
    </Link>
  );
}
