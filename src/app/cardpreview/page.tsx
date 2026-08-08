import { CustomerShell } from "@/components/customer-shell";
import { DiscoveryList, type DiscoveryItem } from "../discovery-list";
import type { Metadata } from "next";

/**
 * معاينة شكل القائمة — بيانات تجريبية، لا تمسّ القاعدة.
 *
 * لرؤية شكل الصفوف الموصولة نحتاج عدّة مطاعم، وليس في القاعدة إلا واحد.
 * وإضافة مطاعم وهمية إلى الإنتاج كانت ستظهر لكل زائر، وتدخل لوحة المالك،
 * وتُحتسب في التقارير. هذه الصفحة تعرض **نفس المكوّن ونفس الأنماط** ببيانات
 * في الذاكرة — فما تراه هنا هو ما ستراه حين يصير عندك خمسون مطعمًا.
 *
 * تُحذف بحذف هذا الملف وحده.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

const DEMO: DiscoveryItem[] = [
  { id: "1", name: "Eficto", slug: "eficto", logo_url: null, cuisine: "إيطالي", cuisine_en: "Italian",
    waiting: 0, accepts: true, closedNow: false, rating: "4.4", branchCount: 2 },
  { id: "2", name: "طواحين الرياض", slug: "x2", logo_url: null, cuisine: "شعبي", cuisine_en: "Traditional",
    waiting: 0, accepts: true, closedNow: false, rating: "4.7", branchCount: 4 },
  { id: "3", name: "برجرايزر", slug: "x3", logo_url: null, cuisine: "برجر", cuisine_en: "Burgers",
    waiting: 0, accepts: false, closedNow: false, rating: "4.2", branchCount: 1 },
  { id: "4", name: "مقهى الرصيف", slug: "x4", logo_url: null, cuisine: "قهوة", cuisine_en: "Coffee",
    waiting: 0, accepts: true, closedNow: false, rating: null, branchCount: 1 },
  { id: "5", name: "نجد الأصيل", slug: "x5", logo_url: null, cuisine: "سعودي", cuisine_en: "Saudi",
    waiting: 10, accepts: true, closedNow: false, rating: "4.9", branchCount: 3 },
  { id: "6", name: "سوشي بار", slug: "x6", logo_url: null, cuisine: "ياباني", cuisine_en: "Japanese",
    waiting: 12, accepts: true, closedNow: false, rating: "4.5", branchCount: 2 },
  { id: "7", name: "مشاوي الخليج", slug: "x7", logo_url: null, cuisine: "مشاوي", cuisine_en: "Grills",
    waiting: 4, accepts: true, closedNow: false, rating: "4.1", branchCount: 2 },
  { id: "8", name: "فطائر أم سعد", slug: "x8", logo_url: null, cuisine: "فطائر", cuisine_en: "Pastries",
    waiting: 0, accepts: true, closedNow: true, rating: "4.6", branchCount: 1 },
  { id: "9", name: "حلويات النخيل", slug: "x9", logo_url: null, cuisine: "حلويات", cuisine_en: "Desserts",
    waiting: 0, accepts: true, closedNow: true, rating: "4.3", branchCount: 5 },
];

export default function CardPreviewPage() {
  return (
    <CustomerShell active="restaurants" search={false}>
      <p
        className="mb-4 rounded-2xl px-4 py-2.5 text-[12.5px] font-bold"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--muted)" }}
      >
        معاينة شكل القائمة — بيانات تجريبية لا علاقة لها بالقاعدة.
      </p>
      <DiscoveryList items={DEMO} />
    </CustomerShell>
  );
}
