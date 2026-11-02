import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { dbConfigured } from "@/lib/db";
import Logo from "@/components/Logo";

// Work-tool type: Inter, as in Linear and Attio. The website keeps Funnel.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "Console", template: "%s · Winnow" },
  robots: { index: false, follow: false },
};

/** The console: its own frame, no marketing nav. Shows a setup note until the database is connected. */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  if (!dbConfigured()) {
    return (
      <main className={`console ${inter.variable} flex min-h-svh flex-col items-center justify-center bg-mist px-5 text-center`}>
        <Logo size={22} />
        <h1 className="mt-8 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">The console is being set up.</h1>
        <p className="mt-2 max-w-[26rem] text-[14px] text-slate">It opens here as soon as its database is connected.</p>
      </main>
    );
  }
  return <div className={`console ${inter.variable} min-h-svh bg-paper text-[13.5px] text-ink`}>{children}</div>;
}
