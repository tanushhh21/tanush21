import Logo from "@/components/Logo";
import { requireUser } from "@/lib/console/context";
import { signOutAction } from "@/lib/console/actions/session";
import { buttonClass } from "@/components/console/ui";

export default async function NoAccess() {
  const user = await requireUser();
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-mist px-5 text-center">
      <Logo size={22} />
      <h1 className="mt-8 font-display text-[22px] font-semibold tracking-[-0.02em]">You&rsquo;re signed in, but not part of a team yet.</h1>
      <p className="mt-2 max-w-[28rem] text-[14px] text-slate">
        Ask an admin at your company to invite {user.email}. Invites arrive by email.
      </p>
      <div className="mt-6 flex gap-2">
        <a href="/#talk" className={buttonClass("primary")}>
          Book a call
        </a>
        <form action={signOutAction}>
          <button type="submit" className={buttonClass("secondary")}>
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
