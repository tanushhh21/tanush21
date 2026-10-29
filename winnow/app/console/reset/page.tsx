import type { Metadata } from "next";
import Link from "next/link";
import { requestReset, resetPassword } from "@/lib/console/actions/session";
import { buttonClass, fieldClass } from "@/components/console/ui";
import AuthCard, { Notice } from "@/components/console/AuthCard";
import PasswordField from "@/components/console/PasswordField";

export const metadata: Metadata = { title: "Reset your password" };

export default async function Reset({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const email = (q.email ?? "").toLowerCase();
  const error = q.error === "code" ? "That code is wrong or has expired." : q.error === "email" ? "Enter a valid email address." : q.error;
  return (
    <AuthCard
      title="Reset your password"
      lead={q.step === "code" ? `If ${email} has an account, we have emailed it a 6-digit code.` : "We will email you a code."}
      foot={
        <Link href="/console/login" className="hover:text-ink hover:underline">
          Back to sign in
        </Link>
      }
    >
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {q.step === "code" ? (
        <form action={resetPassword} className="grid gap-3">
          <input type="hidden" name="email" value={email} />
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium">Code</span>
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="123456" className={`${fieldClass} text-center font-mono text-[20px] tracking-[0.35em]`} />
          </label>
          <PasswordField label="New password" />
          <p className="text-[12px] text-slate">You will be signed out everywhere else.</p>
          <button type="submit" className={`${buttonClass("primary")} h-10 w-full`}>
            Set the new password
          </button>
        </form>
      ) : (
        <form action={requestReset} className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium">Email</span>
            <input name="email" type="email" required autoComplete="email" defaultValue={email} className={fieldClass} />
          </label>
          <button type="submit" className={`${buttonClass("primary")} h-10 w-full`}>
            Email me a code
          </button>
        </form>
      )}
    </AuthCard>
  );
}
