import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { LangProvider } from "@/components/lang-provider";

// خط الشعار والأرقام اللاتينية — الرقم ٨ في الشارة.
// يُحمَّل عبر next/font لا عبر <link>: بلا طلب خارجي وبلا قفزة تخطيط.
const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

// خط الواجهة كلّها — عربي ولاتيني بعائلة واحدة، فلا تختلف النبرة بين
// العنوان والنص. أوزانه الثقيلة تكفي للعناوين فاستُغني عن خط عناوين ثانٍ.
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-ar",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "إيت | EIGHT — خذ دورك بأناقة",
  description:
    "إيت (EIGHT): اختر مطعمك، سجّل اسمك ورقمك، وتابع طابورك لحظة بلحظة.",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "إيت | EIGHT — خذ دورك بأناقة",
    description: "إيت (EIGHT): اختر مطعمك، سجّل اسمك ورقمك، وتابع طابورك لحظة بلحظة.",
    siteName: "EIGHT",
    images: [{ url: "/og-image.png?v=6", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png?v=6"] },
  icons: {
    icon: [
      { url: "/favicon.ico?v=6", sizes: "16x16 32x32 48x48 64x64 128x128 256x256" },
      { url: "/icon-32.png?v=6", sizes: "32x32", type: "image/png" },
      { url: "/icon-64.png?v=6", sizes: "64x64", type: "image/png" },
      { url: "/icon-128.png?v=6", sizes: "128x128", type: "image/png" },
      { url: "/icon-192.png?v=6", sizes: "192x192", type: "image/png" },
      { url: "/icon-256.png?v=6", sizes: "256x256", type: "image/png" },
      { url: "/icon-512.png?v=6", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-32.png?v=6",
    apple: "/icon-180.png?v=6",
  },
};

export const viewport: Viewport = {
  themeColor: "#781e0c",
  width: "device-width",
  initialScale: 1,
  // بدون `cover` لا تعمل `env(safe-area-inset-*)` أصلًا، فيقع الشريط السفلي
  // تحت شريط الصفحة الرئيسية في آيفون ويُقصّ. ولا نُعطّل التكبير: من يحتاجه
  // يحتاجه، و`touch-action: manipulation` يكفي لإلغاء تردّد اللمستين.
  viewportFit: "cover",
};

// الغلاف ثابتٌ بالعربية عمدًا. قراءة كوكي اللغة هنا كانت تُجبر كل صفحة في
// التطبيق على التوليد لكل زائر، فيرى العميل فراغًا قبل المحتوى. واللغة الآن
// تُقرأ في المتصفّح داخل LangProvider — انظر تعليله هناك.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${plexArabic.variable} ${dmSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
