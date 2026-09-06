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
    // كانت هنا الشعار الفرعي أيضًا — لكن معاينة مشاركة الرابط (شير شيت
    // آيفون مثلًا) تسحب هذا العنوان لا وسم <title>، فبقي «خذ دورك بأناقة»
    // ظاهرًا رغم تفريغه من شريط التبويب. اسم البراند وحده الآن، في كل مكان.
    title: "EIGHT",
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
    // أربعة مقاسات لا مقاسٌ واحد: أجهزة آيفون الأقدم/الأصغر تطلب مقاسها
    // الحقيقي (بلا تصغيرٍ من ١٨٠) فيبقى الشعار حادًّا على الشاشة الرئيسية.
    apple: [
      { url: "/brand/v7/icon-180.png", sizes: "180x180" },
      { url: "/brand/v7/icon-167.png", sizes: "167x167" },
      { url: "/brand/v7/icon-152.png", sizes: "152x152" },
      { url: "/brand/v7/icon-120.png", sizes: "120x120" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "EIGHT",
    // ‏"black-translucent" يجعل نص شريط الحالة أبيض — غير مقروء فوق
    // خلفيتنا الكريمية. "default" يبقيه داكنًا.
    statusBarStyle: "default",
    // سفاري لا يقرأ background_color ولا icons من المانيفست إطلاقًا لشاشة
    // البداية، ويحتاج صورةً جاهزة بمقاس كل جهاز بالضبط.
    startupImage: [
      { url: "/splash/iphone-16-pro-max-portrait.png", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-16-pro-max-landscape.png", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" },
      { url: "/splash/iphone-16-pro-portrait.png", media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-16-pro-landscape.png", media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" },
      { url: "/splash/iphone-16-plus-portrait.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-16-plus-landscape.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" },
      { url: "/splash/iphone-16-portrait.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-16-landscape.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" },
      { url: "/splash/iphone-14-plus-portrait.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-14-plus-landscape.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" },
      { url: "/splash/iphone-14-portrait.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-14-landscape.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" },
      { url: "/splash/iphone-13-mini-portrait.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-13-mini-landscape.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" },
      { url: "/splash/iphone-11-pro-max-portrait.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-11-pro-max-landscape.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" },
      { url: "/splash/iphone-11-portrait.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/iphone-11-landscape.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" },
      { url: "/splash/iphone-8-plus-portrait.png", media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-8-plus-landscape.png", media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" },
      { url: "/splash/iphone-8-portrait.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/iphone-8-landscape.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" },
      { url: "/splash/iphone-se-portrait.png", media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/iphone-se-landscape.png", media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" },
      { url: "/splash/ipad-pro-12-portrait.png", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/ipad-pro-12-landscape.png", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" },
      { url: "/splash/ipad-pro-11-portrait.png", media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/ipad-pro-11-landscape.png", media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" },
      { url: "/splash/ipad-air-10-5-portrait.png", media: "(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/ipad-air-10-5-landscape.png", media: "(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" },
      { url: "/splash/ipad-10-2-portrait.png", media: "(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/ipad-10-2-landscape.png", media: "(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" },
      { url: "/splash/ipad-9-7-portrait.png", media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/ipad-9-7-landscape.png", media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" },
      { url: "/splash/ipad-mini-8-3-portrait.png", media: "(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/ipad-mini-8-3-landscape.png", media: "(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" },
    ],
  },
};

export const viewport: Viewport = {
  // كريمي الهيدر (--brand-cream-2) لا عنابي: سفاري يلوّن شريط عنوانه بهذا
  // اللون، وكان عنابيًّا غامقًا لا يطابق شيئًا مرئيًّا فيبهت إلى نغمةٍ باهتة
  // لا تُطابق كريمي الهيدر تحته — فتبين «فجوة» بينهما. لونٌ واحدٌ متطابق
  // يذيب الحدّ فيمتدّ لون الهوية للأعلى فعلًا لا الشريط فقط.
  themeColor: "#e4d7c2",
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
