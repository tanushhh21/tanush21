import type { Metadata, Viewport } from "next";
import { Funnel_Display, Geist, Geist_Mono } from "next/font/google";
import SmoothScroll from "@/components/SmoothScroll";
import RevealObserver from "@/components/RevealObserver";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-geist",
});

const funnel = Funnel_Display({
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
  variable: "--font-funnel",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Winnow · Find faster. Read smarter. Hire better.",
  description: "Find faster. Read smarter. Hire better. Winnow is an AI-native hiring firm in India.",
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${funnel.variable}`} suppressHydrationWarning>
      <head>
        {/* Lets CSS hide not-yet-revealed content only when JS will reveal it. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <SmoothScroll />
        {children}
        <RevealObserver />
      </body>
    </html>
  );
}
