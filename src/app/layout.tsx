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
  // اسم البراند وحده في تبويب المتصفّح — كان «EIGHT — خذ دورك بأناقة» يطول
  // على كل صفحةٍ لا تعرّف عنوانها الخاص (اللوحة الداخلية مثلًا)، والشعار
  // مكانه معاينة المشاركة والوصف لا شريط التبويب.
  title: "EIGHT",
  description:
    "EIGHT: اختر مطعمك، سجّل اسمك ورقمك، وتابع طابورك لحظة بلحظة.",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "EIGHT — خذ دورك بأناقة",
    description: "EIGHT: اختر مطعمك، سجّل اسمك ورقمك، وتابع طابورك لحظة بلحظة.",
    siteName: "EIGHT",
    images: [{ url: "/brand/v7/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/brand/v7/og-image.png"] },
  // ═══ لماذا مسارٌ جديد لا ?v=7 ═══
  // سفاري يخزّن أيقونة الموقع مفهرسةً بمسارها، ويتجاهل سلسلة الاستعلام.
  // فبقيت `/icon-180.png?v=6` تُقدَّم من ذاكرته بشعار العلامة القديمة مهما
  // رفعنا الرقم. ومسارٌ لم يره قطّ لا نسخة له عنده — فيجلبه مضطرًّا.
  // (وهذا يصحّح ما يراه كل من زار الموقع قبل تغيير العلامة، لا نحن فقط.)
  icons: {
    icon: [
      { url: "/brand/v7/favicon.ico", sizes: "16x16 32x32 48x48 64x64 128x128 256x256" },
      { url: "/brand/v7/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/v7/icon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/brand/v7/icon-128.png", sizes: "128x128", type: "image/png" },
      { url: "/brand/v7/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/v7/icon-256.png", sizes: "256x256", type: "image/png" },
      { url: "/brand/v7/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/brand/v7/icon-32.png",
    apple: "/brand/v7/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#781e0c",
  width: "device-width",
  initialScale: 1,
  // بدون `cover` لا تعمل `env(safe-area-inset-*)` أصلًا، فيقع الشريط السفلي
  // تحت شريط الصفحة الرئيسية في آيفون ويُقصّ.
  viewportFit: "cover",
  // مُثبَّتٌ كتطبيق (PWA) على شاشة الجهاز: التكبير بإصبعين وتحريك الصفحة
  // يقولان «متصفّح» لا «تطبيق». نمنعهما هنا فقط — `touch-action: manipulation`
  // في globals.css يبقى يلغي تردّد اللمستين وحده، وهذا مقصودٌ منفصل.
  maximumScale: 1,
  userScalable: false,
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
