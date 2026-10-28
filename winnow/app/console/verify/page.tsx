import type { Metadata } from "next";
import Link from "next/link";
import { confirmEmail, resendCode } from "@/lib/console/actions/session";
import { buttonClass, fieldClass } from "@/components/console/ui";
import AuthCard, { Notice } from "@/components/console/AuthCard";

export const metadata: Metadata = { title: "Confirm your email" };

export default async function Verify({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const email = (q.email ?? "").toLowerCase();
  const nextUrl = q.next && q.next.startsWith("/console") ? q.next : "/console";
  return (
    <AuthCard
      title="Check your email"
      lead={
        <>
          We sent a 6-digit code to <span className="font-medium text-ink">{email || "your email"}</span>. It expires in 15 minutes.
        </>
      }
      foot={
        <Link href="/console/login" className="hover:text-ink hover:underline">
          Back to sign in
        </Link>
      }
    >
      {q.error ? <Notice tone="alert">{q.error === "code" ? "That code is wrong or has expired. Try again, or send a new one." : q.error}</Notice> : null}
      {q.sent ? <Notice>A new code is on its way.</Notice> : null}
      <form action={confirmEmail} className="grid gap-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={nextUrl} />
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium">Code</span>
          <input
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            autoFocus
            className={`${fieldClass} text-center font-mono text-[20px] tracking-[0.35em]`}
          />
        </label>
        <button type="submit" className={`${buttonClass("primary")} h-10 w-full`}>
          Confirm
        </button>
      </form>
      <form action={resendCode} className="mt-4 text-center">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={nextUrl} />
        <button type="submit" className="text-[13px] text-slate hover:text-ink hover:underline">
          Send a new code
        </button>
      </form>
    </AuthCard>
  );
}
