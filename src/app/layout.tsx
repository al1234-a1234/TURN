import type { Metadata, Viewport } from "next";
import { Tajawal, Almarai } from "next/font/google";
import "./globals.css";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800"],
  display: "swap",
});

const almarai = Almarai({
  variable: "--font-almarai",
  subsets: ["arabic"],
  weight: ["300", "400", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "دور | Turn — قوائم انتظار المطاعم",
  description:
    "دور (Turn): منصة قوائم انتظار ذكية للمطاعم — خذ دورك وتابع طابورك بسهولة.",
  icons: {
    icon: "/icon-32.png",
    apple: "/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e1c15",
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
      className={`dark ${tajawal.variable} ${almarai.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
