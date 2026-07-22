import Link from "next/link";

/**
 * شعار TURN الحرفي — حرف T + TURN بخط Baskerville على خلفية برتقالي محروق #661C0A.
 * متجه وحاد بأي مقاس (بلا صورة نقطية).
 */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span className="turn-badge" style={{ width: size, height: size, fontSize: size }} aria-label="TURN">
      <span>
        <span className="tb-t">T</span>
        <span className="tb-w">TURN</span>
      </span>
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
      <span className="font-display text-lg font-bold text-cream-100/95">دور</span>
    </Link>
  );
}
