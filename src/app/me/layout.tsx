// غلاف خادميّ رقيق: صفحة «حسابي» صارت مكوّن عميل (انظر تعليلها) ومكوّن
// العميل لا يصدّر metadata — فالعنوان يسكن هنا.
export const metadata = { title: "حسابي · إيت" };

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
