import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // الرفع صار عبر الخادم (جلسة الكوكيز الموثوقة) — الحد الافتراضي 1MB لا يكفي صورة
  experimental: { serverActions: { bodySizeLimit: "20mb" } },

  // صور المطاعم تُخزَّن في حاوية Supabase العامّة. بدون هذا النمط يرفض
  // next/image أي مصدر خارجي، فتبقى الصور تُخدَم بحجمها الأصلي.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "nkdfxmjuigslmangzuua.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // أصغر أولًا: أكثر شاشات المستخدمين جوّالات، وأكبر مقاس نحتاجه غلافُ
    // بطاقة المطعم. توليد مقاسات أكبر من ذلك إنفاقٌ بلا مشاهد.
    imageSizes: [16, 32, 48, 56, 64, 96, 128, 256, 384],
    deviceSizes: [360, 420, 640, 828, 1080, 1200],
    formats: ["image/avif", "image/webp"],
  },

  /*
   * ترويسات أمان — لم تكن موجودة إطلاقًا.
   *
   * أهمّها Referrer-Policy: رابط التذكرة /t/<uuid> هو مفتاح الدور نفسه (من يملكه
   * يلغي الدور). وبالسلوك الافتراضي يُرسَل المتصفّح هذا المسار كاملًا في ترويسة
   * Referer إلى كل مورد خارجي تفتحه الصفحة — أي أن المعرّف كان يتسرّب خارج
   * نطاقنا بلا أي تدخّل من أحد. no-referrer يقطع هذا المصدر تمامًا.
   *
   * والبقيّة تحصينات قياسية: منع تخمين نوع المحتوى (يبطل تحويل ملفٍ مرفوع إلى
   * سكربت)، ومنع تأطير الموقع في نطاق غريب (نقر مخادع على أزرار الاستقبال)،
   * وإغلاق واجهات الأجهزة التي لا نستعملها.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

/*
 * تغليف Sentry — يرفع خرائط المصدر وقت البناء فيصير أثر الخطأ أسماءَ ملفاتنا
 * وأسطرَنا بدل شيفرةٍ مضغوطة لا تُقرأ. وبدون رمز الرفع (SENTRY_AUTH_TOKEN)
 * يتخطّى الرفع بهدوء ويبقى البناء ناجحًا — فالمشروع لا يتوقّف على إعداد ناقص.
 *
 * وtunnelRoute يمرّر بلاغات المتصفّح عبر نطاقنا: مانعات الإعلانات تحجب طلبات
 * Sentry المباشرة، وهي شائعة على الجوّالات — فبدونه نفقد بلاغات الزبائن
 * تحديدًا، وهم أصلًا من لا يشتكي.
 */
export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
  tunnelRoute: "/monitoring",
  // مراقبة وظائف Vercel المجدولة تلقائيًّا
  automaticVercelMonitors: true,
});
