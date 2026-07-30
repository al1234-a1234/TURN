import Link from "next/link";
import { BrandMark } from "@/components/brand";

/* رابط خاطئ/مطعم محذوف كان يعرض 404 الإنجليزية الافتراضية — أول انطباع سيّئ
   لعميل وصله رابط قديم بواتساب. صفحة بهويتنا تعيده للرئيسية. */
export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl" style={{ background: "linear-gradient(160deg, #b23c1d 0%, #8a2a14 58%, #661c0a 100%)" }}>
        <BrandMark size={48} />
      </span>
      <h1 className="mt-6 font-display text-2xl font-bold text-[color:var(--ink)]">الصفحة غير موجودة</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[color:var(--muted)]">
        يمكن الرابط قديم أو المطعم لم يعد متاحًا. تقدر تتصفح المطاعم المتاحة الآن من الرئيسية.
      </p>
      <Link href="/" className="rq-btn mt-6 !w-auto px-8">
        الرئيسية ←
      </Link>
    </div>
  );
}
