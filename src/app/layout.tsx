import type { Metadata, Viewport } from "next";
import { El_Messiri, Almarai, Playfair_Display, Libre_Baskerville } from "next/font/google";
import "./globals.css";
import { getLang } from "@/lib/i18n-server";
import { dirOf } from "@/lib/i18n";
import { LangProvider } from "@/components/lang-provider";

const baskerville = Libre_Baskerville({
  variable: "--font-baskerville",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const elmessiri = El_Messiri({
  variable: "--font-elmessiri",
  subsets: ["arabic", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const almarai = Almarai({
  variable: "--font-almarai",
  subsets: ["arabic"],
  weight: ["300", "400", "700", "800"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "دور | Turn — خذ دورك بأناقة",
  description:
    "دور (Turn): اختر مطعمك، سجّل اسمك ورقمك، وتابع طابورك لحظة بلحظة.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-32.png?v=3", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png?v=3", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/icon-32.png?v=3",
    apple: "/icon-180.png?v=3",
  },
};

export const viewport: Viewport = {
  themeColor: "#7a2410",
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
      className={`${elmessiri.variable} ${almarai.variable} ${playfair.variable} ${baskerville.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
