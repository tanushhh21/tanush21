import type { Metadata } from "next";
import { dbConfigured } from "@/lib/db";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: { default: "Console", template: "%s · Winnow" },
  robots: { index: false, follow: false },
};

/** The console: its own frame, no marketing nav. Shows a setup note until the database is connected. */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  if (!dbConfigured()) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center bg-mist px-5 text-center">
        <Logo size={22} />
        <h1 className="mt-8 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">The console is being set up.</h1>
        <p className="mt-2 max-w-[26rem] text-[14px] text-slate">It opens here as soon as its database is connected.</p>
      </main>
    );
  }
  return <div className="min-h-svh bg-paper text-[14px] text-ink">{children}</div>;
}
