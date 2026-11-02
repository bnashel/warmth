import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Warmth",
  description: "An ambient, live map of how a city feels.",
};

export const viewport: Viewport = {
  themeColor: "#0A0B0F",
  // THE PINCH BELONGS TO THE MAP (mobile audit, 07-27): without this,
  // any pinch the map's handlers miss (orb island, chips, the freeze
  // window while a finger holds the orb) zooms the whole DOCUMENT and
  // the entire UI scales — "the app is glitchy when zooming". The app
  // is a fixed full-screen stage; the page itself never zooms.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
