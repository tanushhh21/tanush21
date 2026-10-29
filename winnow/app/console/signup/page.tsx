import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { providers } from "@/lib/auth";
import { getUser } from "@/lib/console/context";
import { signInGoogle, signUp } from "@/lib/console/actions/session";
import { buttonClass, fieldClass } from "@/components/console/ui";
import AuthCard, { GoogleG, Notice } from "@/components/console/AuthCard";
import PasswordField from "@/components/console/PasswordField";

export const metadata: Metadata = { title: "Create an account" };

const ERRORS: Record<string, string> = {
  name: "Tell us your name.",
  email: "Enter a valid email address.",
  exists: "There is already an account with this email. Sign in, or reset your password.",
};

export default async function SignUp({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await getUser()) redirect("/console");
  const q = await searchParams;
  const nextUrl = q.next && q.next.startsWith("/console") ? q.next : "/console";
  const emailReady = Boolean(process.env.RESEND_API_KEY) || !process.env.VERCEL;
  return (
    <AuthCard
      title="Create your Winnow account"
      lead="We will email you a code to confirm the address."
      foot={
        <>
          Already have an account?{" "}
          <Link href="/console/login" className="font-medium text-signal hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {q.error ? (
        <Notice tone="alert">
          {ERRORS[q.error] ?? q.error}
          {q.error === "exists" ? (
            <>
              {" "}
              <Link href={`/console/login?email=${encodeURIComponent(q.email ?? "")}`} className="underline">
                Sign in
              </Link>
            </>
          ) : null}
        </Notice>
      ) : null}
      {!emailReady ? <Notice tone="alert">New accounts need email to confirm the address, and email is not switched on yet.</Notice> : null}
      <form action={signUp} className="grid gap-3">
        <input type="hidden" name="next" value={nextUrl} />
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium">Your name</span>
          <input name="name" required autoComplete="name" defaultValue={q.name ?? ""} className={fieldClass} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium">Work email</span>
          <input name="email" type="email" required autoComplete="email" defaultValue={q.email ?? ""} placeholder="you@company.com" className={fieldClass} />
        </label>
        <PasswordField />
        <button type="submit" disabled={!emailReady} className={`${buttonClass("primary")} mt-1 h-10 w-full`}>
          Create account
        </button>
      </form>
      {providers.google ? (
        <>
          <p className="my-5 flex items-center gap-3 text-[12px] text-slate before:h-px before:flex-1 before:bg-hairline after:h-px after:flex-1 after:bg-hairline">or</p>
          <form action={signInGoogle}>
            <input type="hidden" name="next" value={nextUrl} />
            <button type="submit" className={`${buttonClass("secondary")} h-11 w-full gap-2.5 text-[14.5px]`}>
              <GoogleG />
              Sign up with Google
            </button>
          </form>
        </>
      ) : null}
    </AuthCard>
  );
}
