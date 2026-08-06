import QRCode from "qrcode";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SITE_HOST } from "@/lib/site";
import { TvBoard } from "./tv-board";
import Image from "next/image";

export const dynamic = "force-dynamic";

/**
 * شاشة عرض الطابور — تُعلّق في صالة المطعم (تلفاز/تابلت).
 * معرّف الفرع هو مفتاح الوصول (نمط روابط التذاكر)، والأسماء مقنّعة من القاعدة.
 * قناة تسويق مزدوجة: الواقفون يطمئنون لدورهم، وكل زائر يرى QR «خذ دورك».
 */
export default async function TvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("tv_queue", { p_branch_id: id });
  const rows = data ?? [];
  const meta = rows[0];

  // أقسام الفرع — عمودٌ لقسمٍ لا يملكه المطعم يظهر على شاشةٍ معلّقة في صالته
  // فارغًا أبدًا، ويقرؤه الضيف «لا أحد بالانتظار» فيظنّ الشاشة معطّلة.
  const { data: tvZones } = await supabase
    .from("branch_settings")
    .select("has_inside, has_outside")
    .eq("branch_id", id)
    .maybeSingle();
  const tvHasInside = tvZones?.has_inside ?? true;
  const tvHasOutside = tvZones?.has_outside ?? true;

  // فشل الاستدعاء كان يظهر «تأكد من الرابط» — فيذهب الموظّف يفتّش رابطًا سليمًا
  // بينما العطل في الجلب. نفصل الحالتين: هنا خلل مؤقّت، وأسفله رابط لا فرع له.
  if (error) {
    console.error("[tv/[id]] tv_queue:", id, error.message);
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <p className="text-2xl font-bold text-[color:var(--muted)]">تعذّر التحميل — حدّث الصفحة.</p>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <p className="text-2xl font-bold text-[color:var(--muted)]">الشاشة غير متاحة — تأكد من الرابط.</p>
      </div>
    );
  }

  // النطاق من الطلب نفسه — رابط ثابت كان يكسر QR عند تغيير الاستضافة/النطاق
  const h = await headers();
  const host = h.get("host") ?? SITE_HOST;
  const proto = host.includes("localhost") ? "http" : "https";
  const joinUrl = `${proto}://${host}/r/${meta.restaurant_slug}?branch=${id}`;
  const qr = await QRCode.toString(joinUrl, { type: "svg", margin: 1, color: { dark: "#781e0c", light: "#0000" } });

  return (
    <div dir="rtl" className="flex min-h-screen flex-col gap-6 p-8" style={{ background: "var(--bg)" }}>
      {/* الرأس: هوية المطعم + QR الانضمام */}
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          {meta.restaurant_logo ? (
            <Image src={meta.restaurant_logo} alt="" width={80} height={80} sizes="80px" className="h-20 w-20 rounded-3xl object-cover" style={{ border: "2px solid rgba(102,28,10,0.15)" }} />
          ) : null}
          <div>
            <h1 className="font-display text-5xl font-bold" style={{ color: "var(--ink)" }}>{meta.restaurant_name}</h1>
            <p className="mt-1 text-2xl font-bold" style={{ color: "var(--muted)" }}>{meta.branch_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-3xl bg-[color:var(--surface)] p-4" style={{ border: "1px solid rgba(102,28,10,0.14)" }}>
          <div className="text-left">
            <p className="font-display text-2xl font-bold" style={{ color: "var(--brand-d)" }}>خذ دورك من جوّالك</p>
            <p className="text-sm font-bold" style={{ color: "var(--muted)" }}>امسح الرمز — بلا تطبيق ولا حساب</p>
          </div>
          <span className="block h-28 w-28" dangerouslySetInnerHTML={{ __html: qr }} />
        </div>
      </header>

      <TvBoard branchId={id} initial={rows} hasInside={tvHasInside} hasOutside={tvHasOutside} />

      <footer className="text-center text-sm font-bold" style={{ color: "rgba(102,28,10,0.4)" }} dir="ltr">
        EIGHT · إيت
      </footer>
    </div>
  );
}
