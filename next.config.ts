import type { NextConfig } from "next";

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
};

export default nextConfig;
