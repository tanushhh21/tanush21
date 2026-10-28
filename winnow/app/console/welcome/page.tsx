import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { invites, orgs } from "@/lib/db/schema";
import { getOrgs, requireUser } from "@/lib/console/context";
import { acceptInvite, createCompany, signOutAction } from "@/lib/console/actions/session";
import { buttonClass, fieldClass } from "@/components/console/ui";
import AuthCard, { Notice } from "@/components/console/AuthCard";

export const metadata: Metadata = { title: "Welcome" };

const LEVEL = { hiring_manager: "hiring manager", ta: "talent acquisition", admin: "admin" } as const;

/** Signed in, but not part of a company yet: join one you were invited to, or create your own. */
export default async function Welcome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  if (!user.emailVerified) redirect(`/console/verify?email=${encodeURIComponent(user.email ?? "")}`);
  if ((await getOrgs(user.id, user.isOperator)).length) redirect("/console");
  const error = (await searchParams).error;
  const pending = await db
    .select({ token: invites.token, access: invites.access, org: orgs.name })
    .from(invites)
    .innerJoin(orgs, eq(orgs.id, invites.orgId))
    .where(and(eq(invites.email, (user.email ?? "").toLowerCase()), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));
  const open = process.env.WINNOW_SIGNUP !== "invite";
  return (
    <AuthCard
      title={`Welcome${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
      lead={pending.length ? "You have been invited." : open ? "Set up your company to start hiring with Winnow." : `Ask your team to invite ${user.email}.`}
      foot={
        <form action={signOutAction}>
          <button type="submit" className="hover:text-ink hover:underline">
            Sign out
          </button>
        </form>
      }
    >
      {error ? <Notice tone="alert">{error === "name" ? "Give your company a name." : error === "limit" ? "You have created the most companies one account can. Write to us at hello@getwinnow.in." : "Something went wrong."}</Notice> : null}
      {pending.length ? (
        <ul className="grid gap-2">
          {pending.map((p) => (
            <li key={p.token}>
              <form action={acceptInvite} className="flex items-center justify-between gap-3 rounded-[12px] border border-hairline px-4 py-3">
                <input type="hidden" name="token" value={p.token} />
                <span className="text-[14px]">
                  <span className="font-medium">{p.org}</span>
                  <span className="block text-[12.5px] text-slate">as {LEVEL[p.access]}</span>
                </span>
                <button type="submit" className={buttonClass("primary", "sm")}>
                  Join
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <form action={createCompany} className={`grid gap-3 ${pending.length ? "mt-6 border-t border-hairline pt-6" : ""}`}>
          {pending.length ? <p className="text-[13px] font-medium">Or create your own company</p> : null}
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium">Company name</span>
            <input name="name" required minLength={2} maxLength={120} autoComplete="organization" className={fieldClass} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium">
              Website <span className="font-normal text-slate">(optional)</span>
            </span>
            <input name="domain" placeholder="yourcompany.com" className={fieldClass} />
          </label>
          <button type="submit" className={`${buttonClass(pending.length ? "secondary" : "primary")} h-10 w-full`}>
            Create company
          </button>
        </form>
      ) : null}
    </AuthCard>
  );
}
