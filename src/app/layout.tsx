import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Reem_Kufi, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

// عناوين لاتينية فاخرة (TURN)
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

// عناوين عربية فخمة
const reem = Reem_Kufi({
  variable: "--font-reem",
  subsets: ["arabic", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

// نصوص
const plex = IBM_Plex_Sans_Arabic({
  variable: "--font-plex",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "دور | Turn — تجربة انتظار راقية",
  description:
    "دور (Turn): تجربة انتظار راقية لأفخم المطاعم — خذ دورك وتابع طابورك بأناقة.",
  icons: {
    icon: "/icon-32.png",
    apple: "/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c1712",
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
      className={`dark ${cormorant.variable} ${reem.variable} ${plex.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        {/* طبقة تعتيم الأطراف (vignette) */}
        <div className="vignette-layer" aria-hidden />
        {/* طبقة حبيبات الفيلم */}
        <div className="grain-layer" aria-hidden />
      </body>
    </html>
  );
}
