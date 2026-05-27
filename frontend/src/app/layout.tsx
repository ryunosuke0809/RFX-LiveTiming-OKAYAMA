import type { Metadata, Viewport } from "next";
import { Titillium_Web, Roboto_Mono } from "next/font/google";
import "./globals.css";

const titillium = Titillium_Web({
  variable: "--font-titillium",
  subsets: ["latin"],
  weight: ["200", "300", "400", "600", "700", "900"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Live Timing | Okayama International Circuit",
  description: "Live Timing for Okayama International Circuit motorsport events",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${titillium.variable} ${robotoMono.variable} antialiased`}
    >
      <body className="flex flex-col bg-[#0c0c0f] text-zinc-200 overflow-hidden app-shell">
        {children}
      </body>
    </html>
  );
}
