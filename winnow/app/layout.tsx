import type { Metadata, Viewport } from "next";
import { Funnel_Display, Funnel_Sans, Geist_Mono } from "next/font/google";
import { SITE_URL, pageMeta } from "@/lib/site";
import "./globals.css";

const funnelSans = Funnel_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-funnel-sans",
});

const funnel = Funnel_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-funnel",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-geist-mono",
});

const TITLE = "Winnow · Source faster. Screen smarter. Hire better.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Winnow" },
  ...pageMeta("/", TITLE, "AI-native hiring for Indian companies. Sourcing, evaluation and shortlisting on one system."),
  twitter: { card: "summary" },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${funnelSans.variable} ${geistMono.variable} ${funnel.variable}`} suppressHydrationWarning>
      <head>
        {/* Lets CSS hide not-yet-revealed content only when JS will reveal it. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
