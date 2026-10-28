import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Logo from "@/components/Logo";
import { providers } from "@/lib/auth";
import { getUser } from "@/lib/console/context";
import { signInDev, signInEmail, signInGoogle } from "@/lib/console/actions/session";
import { buttonClass, fieldClass } from "@/components/console/ui";

export const metadata: Metadata = { title: "Sign in" };

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await getUser()) redirect("/console");
  const q = await searchParams;
  const none = !providers.google && !providers.email && !providers.dev;
  return (
    <main className="flex min-h-svh items-center justify-center bg-mist px-5 py-16">
      <div className="w-full max-w-[24rem]">
        <div className="flex justify-center">
          <Logo size={24} />
        </div>
        <div className="mt-8 rounded-[18px] border border-hairline bg-paper p-6 shadow-lift sm:p-8">
          <h1 className="text-center font-display text-[20px] font-semibold tracking-[-0.02em]">Sign in to Winnow</h1>
          {q.sent ? (
            <p role="status" className="mt-4 rounded-[10px] bg-signal/[0.06] px-3 py-2.5 text-center text-[13.5px] text-ink">
              Check your inbox for a sign-in link.
            </p>
          ) : null}
          {q.error ? (
            <p role="alert" className="mt-4 rounded-[10px] bg-alert/[0.06] px-3 py-2.5 text-center text-[13.5px] text-alert">
              {q.error === "email" ? "Enter a valid email address." : "That sign-in did not work. Try again."}
            </p>
          ) : null}
          <div className="mt-6 grid gap-3">
            {providers.google ? (
              <form action={signInGoogle}>
                <input type="hidden" name="next" value={q.next ?? "/console"} />
                <button type="submit" className={`${buttonClass("secondary")} h-11 w-full gap-2.5 text-[14.5px]`}>
                  <GoogleG />
                  Continue with Google
                </button>
              </form>
            ) : null}
            {providers.google && providers.email ? (
              <p className="flex items-center gap-3 text-[12px] text-slate before:h-px before:flex-1 before:bg-hairline after:h-px after:flex-1 after:bg-hairline">or</p>
            ) : null}
            {providers.email ? (
              <form action={signInEmail} className="grid gap-2.5">
                <input type="hidden" name="next" value={q.next ?? "/console"} />
                <label htmlFor="email" className="sr-only">
                  Work email
                </label>
                <input id="email" name="email" type="email" required placeholder="you@company.com" autoComplete="email" className={fieldClass} />
                <button type="submit" className={`${buttonClass(providers.google ? "secondary" : "primary")} h-10 w-full`}>
                  Email me a sign-in link
                </button>
              </form>
            ) : null}
            {providers.dev ? (
              <form action={signInDev} className="grid gap-2.5 border-t border-dashed border-hairline pt-4">
                <p className="text-[12.5px] text-slate">Development sign-in (local only)</p>
                <input name="email" type="email" required placeholder="email" className={fieldClass} aria-label="Email" />
                <input name="name" placeholder="name (optional)" className={fieldClass} aria-label="Name" />
                <input type="hidden" name="next" value={q.next ?? "/console"} />
                <button type="submit" className={`${buttonClass("primary")} h-10 w-full`}>
                  Sign in
                </button>
              </form>
            ) : null}
            {none ? <p className="text-center text-[13.5px] text-slate">Sign-in is not switched on yet.</p> : null}
          </div>
        </div>
        <p className="mt-6 text-center text-[12.5px] text-slate">No password needed. Access is by invitation from your team.</p>
      </div>
    </main>
  );
}
