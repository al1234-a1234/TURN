import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // الرفع صار عبر الخادم (جلسة الكوكيز الموثوقة) — الحد الافتراضي 1MB لا يكفي صورة
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
};

export default nextConfig;
