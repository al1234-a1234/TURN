import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { getLang } from "@/lib/i18n-server";
import { dirOf } from "@/lib/i18n";
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
    images: [{ url: "/og-image.png?v=5", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png?v=5"] },
  icons: {
    icon: [
      { url: "/icon-32.png?v=5", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png?v=5", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/icon-32.png?v=5",
    apple: "/icon-180.png?v=5",
  },
};

export const viewport: Viewport = {
  themeColor: "#781e0c",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLang();
  return (
    <html
      lang={lang}
      dir={dirOf(lang)}
      className={`${plexArabic.variable} ${dmSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
