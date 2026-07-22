import type { Metadata, Viewport } from "next";
import { El_Messiri, Almarai, Playfair_Display, Libre_Baskerville } from "next/font/google";
import "./globals.css";

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
  icons: {
    icon: "/icon-32.png",
    apple: "/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#7a2410",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${elmessiri.variable} ${almarai.variable} ${playfair.variable} ${baskerville.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
