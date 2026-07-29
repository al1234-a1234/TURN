import { SectionLoading } from "./section-loading";

/**
 * شاشة تحميل فورية تظهر لحظة الضغط على أي تبويب — تعطي إحساسًا بالاستجابة الفورية.
 * ملاحظة: هذا يملأ فقط فتحة {children} داخل <OwnerShell>، والقائمة الجانبية
 * الحقيقية من layout.tsx تبقى ثابتة — رسم هيكل قائمة جانبية وهمي هنا كان
 * يظهر متداخلًا وخاطئًا داخل <main> الحقيقية.
 */
export default function DashboardLoading() {
  return <SectionLoading />;
}
