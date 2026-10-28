import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { providers } from "@/lib/auth";
import { getUser } from "@/lib/console/context";
import { signInDev, signInEmail, signInGoogle, signInPassword } from "@/lib/console/actions/session";
import { buttonClass, fieldClass } from "@/components/console/ui";
import AuthCard, { GoogleG, Notice } from "@/components/console/AuthCard";

export const metadata: Metadata = { title: "Sign in" };


const ERRORS: Record<string, string> = {
  password: "That email and password do not match.",
  locked: "Too many wrong tries. Wait 15 minutes, or reset your password.",
  email: "Enter a valid email address.",
  OAuthAccountNotLinked: "Sign in the way you first signed up.",
  AccessDenied: "That Google account's email is not confirmed by Google.",
};

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await getUser()) redirect("/console");
  const q = await searchParams;
  const nextUrl = q.next && q.next.startsWith("/console") ? q.next : "/console";
  return (
    <AuthCard
      title="Sign in to Winnow"
      foot={
        <>
          New to Winnow?{" "}
          <Link href={`/console/signup${nextUrl !== "/console" ? `?next=${encodeURIComponent(nextUrl)}` : ""}`} className="font-medium text-signal hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {q.sent ? <Notice>Check your inbox for a sign-in link.</Notice> : null}
      {q.signedout ? <Notice>Signed out everywhere.</Notice> : null}
      {q.error ? <Notice tone="alert">{ERRORS[q.error] ?? "That sign-in did not work. Try again."}</Notice> : null}
      <form action={signInPassword} className="grid gap-3">
        <input type="hidden" name="next" value={nextUrl} />
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium">Email</span>
          <input name="email" type="email" required autoComplete="email" defaultValue={q.email ?? ""} placeholder="you@company.com" className={fieldClass} />
        </label>
        <label className="grid gap-1.5">
          <span className="flex items-baseline justify-between text-[13px] font-medium">
            Password
            <Link href={`/console/reset${q.email ? `?email=${encodeURIComponent(q.email)}` : ""}`} className="text-[12.5px] font-normal text-signal hover:underline">
              Forgot password?
            </Link>
          </span>
          <input name="password" type="password" required autoComplete="current-password" className={fieldClass} />
        </label>
        <button type="submit" className={`${buttonClass("primary")} mt-1 h-10 w-full`}>
          Sign in
        </button>
      </form>
      {providers.google || providers.email ? (
        <p className="my-5 flex items-center gap-3 text-[12px] text-slate before:h-px before:flex-1 before:bg-hairline after:h-px after:flex-1 after:bg-hairline">or</p>
      ) : null}
      <div className="grid gap-3">
        {providers.google ? (
          <form action={signInGoogle}>
            <input type="hidden" name="next" value={nextUrl} />
            <button type="submit" className={`${buttonClass("secondary")} h-11 w-full gap-2.5 text-[14.5px]`}>
              <GoogleG />
              Continue with Google
            </button>
          </form>
        ) : null}
        {providers.email ? (
          <details className="text-center">
            <summary className="cursor-pointer text-[13px] text-slate hover:text-ink">Email me a sign-in link instead</summary>
            <form action={signInEmail} className="mt-3 grid gap-2.5 text-left">
              <input type="hidden" name="next" value={nextUrl} />
              <input name="email" type="email" required placeholder="you@company.com" autoComplete="email" aria-label="Email for a sign-in link" className={fieldClass} />
              <button type="submit" className={`${buttonClass("secondary")} h-10 w-full`}>
                Send the link
              </button>
            </form>
          </details>
        ) : null}
        {providers.dev ? (
          <form action={signInDev} className="grid gap-2.5 border-t border-dashed border-hairline pt-4">
            <p className="text-[12.5px] text-slate">Development sign-in (local only)</p>
            <input name="email" type="email" required placeholder="email" className={fieldClass} aria-label="Email" />
            <input name="name" placeholder="name (optional)" className={fieldClass} aria-label="Name" />
            <input type="hidden" name="next" value={nextUrl} />
            <button type="submit" className={`${buttonClass("primary")} h-10 w-full`}>
              Sign in
            </button>
          </form>
        ) : null}
      </div>
    </AuthCard>
  );
}
