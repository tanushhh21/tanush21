import { and, eq, gt, isNull } from "drizzle-orm";
import Logo from "@/components/Logo";
import { db } from "@/lib/db";
import { invites, orgs } from "@/lib/db/schema";
import { getUser } from "@/lib/console/context";
import { acceptInvite, signOutAction } from "@/lib/console/actions/session";
import { buttonClass } from "@/components/console/ui";

const LEVEL = { hiring_manager: "hiring manager", ta: "talent acquisition", admin: "admin" } as const;

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getUser();
  const row = await db
    .select({ invite: invites, orgName: orgs.name })
    .from(invites)
    .innerJoin(orgs, eq(orgs.id, invites.orgId))
    .where(and(eq(invites.token, token), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .then((r) => r[0]);
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-mist px-5 text-center">
      <Logo size={22} />
      {!row ? (
        <>
          <h1 className="mt-8 font-display text-[22px] font-semibold tracking-[-0.02em]">This invite has expired or was already used.</h1>
          <p className="mt-2 text-[14px] text-slate">Ask whoever invited you to send a new one.</p>
        </>
      ) : (
        <>
          <h1 className="mt-8 font-display text-[22px] font-semibold tracking-[-0.02em]">Join {row.orgName} on Winnow</h1>
          <p className="mt-2 text-[14px] text-slate">You&rsquo;ve been invited as {LEVEL[row.invite.access]}.</p>
          {user && (user.email ?? "").toLowerCase() !== row.invite.email.toLowerCase() ? (
            <div className="mt-6 max-w-[26rem] text-[14px]">
              <p>
                This invite was sent to <span className="font-medium">{row.invite.email}</span>, but you are signed in as {user.email}.
              </p>
              <form action={signOutAction} className="mt-4">
                <button type="submit" className={buttonClass("primary")}>
                  Sign out and use {row.invite.email}
                </button>
              </form>
            </div>
          ) : user ? (
            <form action={acceptInvite} className="mt-6">
              <input type="hidden" name="token" value={token} />
              <button type="submit" className={buttonClass("primary")}>
                Accept and continue
              </button>
              <p className="mt-3 text-[12.5px] text-slate">Signed in as {user.email}</p>
            </form>
          ) : (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <a href={`/console/signup?next=${encodeURIComponent(`/console/invite/${token}`)}`} className={buttonClass("primary")}>
                Create an account
              </a>
              <a href={`/console/login?next=${encodeURIComponent(`/console/invite/${token}`)}`} className={buttonClass("secondary")}>
                Sign in
              </a>
            </div>
          )}
        </>
      )}
    </main>
  );
}
