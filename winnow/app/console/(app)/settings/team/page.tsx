import type { Metadata } from "next";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { invites, memberships, roleAccess, roles, users } from "@/lib/db/schema";
import { can, requireCtx } from "@/lib/console/context";
import { inviteMember, revokeInvite, updateMember } from "@/lib/console/actions/settings";
import { SITE } from "@/lib/console/invites";
import { Badge, Card, CardHead, Field, buttonClass, fieldClass, smallFieldClass } from "@/components/console/ui";
import Saved from "@/components/console/Saved";

export const metadata: Metadata = { title: "Team" };

const ACCESS = { hiring_manager: "Hiring manager", ta: "Talent acquisition", admin: "Admin" } as const;

export default async function Team({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const c = await requireCtx();
  const saved = (await searchParams).saved;
  const admin = can.manageTeam(c);
  const [members, pending, roleList, access] = await Promise.all([
    db
      .select({ m: memberships, name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, c.org.id))
      .orderBy(users.name),
    db.select().from(invites).where(and(eq(invites.orgId, c.org.id), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date()))),
    db.select({ id: roles.id, title: roles.title }).from(roles).where(eq(roles.orgId, c.org.id)).orderBy(roles.title),
    db.select({ roleId: roleAccess.roleId, userId: roleAccess.userId }).from(roleAccess).innerJoin(roles, eq(roles.id, roleAccess.roleId)).where(eq(roles.orgId, c.org.id)),
  ]);
  return (
    <div className="grid gap-5">
      <Saved
        code={saved}
        messages={{
          invited: "Invite sent.",
          "invite-not-sent": "The invite was created but the email could not be sent. Copy the link from the list below.",
          revoked: "Invite withdrawn.",
          saved: "Saved.",
          deactivated: "Deactivated. They can no longer sign in to this organisation; their history stays.",
          reactivated: "Reactivated.",
          removed: "Removed from the organisation.",
          "not-yourself": "You cannot do that to your own account.",
          "bad-email": "That email does not look right.",
        }}
        problems={["invite-not-sent", "not-yourself", "bad-email"]}
      />
      {admin ? (
        <Card>
          <CardHead title="Invite someone" meta="Hiring managers can be limited to the roles you pick." />
          <form action={inviteMember} className="grid gap-3 px-4 py-4 sm:px-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
              <Field label="Email">
                <input name="email" type="email" required placeholder="name@company.com" className={fieldClass} />
              </Field>
              <Field label="Access">
                <select name="access" defaultValue="hiring_manager" className={fieldClass}>
                  {Object.entries(ACCESS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {roleList.length ? (
              <fieldset>
                <legend className="text-[13px] font-medium">
                  Only these roles <span className="font-normal text-slate">(hiring managers; leave empty for the roles they manage)</span>
                </legend>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {roleList.map((r) => (
                    <li key={r.id}>
                      <label className="flex items-center gap-2.5 text-[13.5px]">
                        <input type="checkbox" name="roleIds" value={r.id} className="size-4 accent-[#1b4dff]" />
                        {r.title}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ) : null}
            <div>
              <button type="submit" className={buttonClass("primary")}>
                Send invite
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <CardHead title="People" meta={`${members.filter((m) => !m.m.deactivatedAt).length} active`} />
        <ul className="divide-y divide-hairline">
          {members.map(({ m, name, email }) => {
            const theirs = access.filter((a) => a.userId === m.userId).map((a) => a.roleId);
            return (
              <li key={m.id} className="grid gap-2 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14px]">
                    <span className="font-medium">{name || email}</span> <span className="text-slate">{email}</span>
                    {m.userId === c.user.id ? <span className="text-slate"> (you)</span> : null}
                  </p>
                  <span className="flex items-center gap-2">
                    <Badge tone={m.access === "admin" ? "ink" : "neutral"}>{ACCESS[m.access]}</Badge>
                    {m.restricted ? <Badge tone="caution">{theirs.length} role{theirs.length === 1 ? "" : "s"} only</Badge> : null}
                    {m.deactivatedAt ? <Badge tone="muted">Deactivated</Badge> : null}
                  </span>
                </div>
                {admin ? (
                  <details className="text-[13px]">
                    <summary className="cursor-pointer text-slate hover:text-ink">Change</summary>
                    <form action={updateMember} className="mt-2 grid gap-2">
                      <input type="hidden" name="userId" value={m.userId} />
                      <input type="hidden" name="op" value="access" />
                      <div className="flex flex-wrap items-center gap-3">
                        <select name="access" defaultValue={m.access} aria-label="Access" className={smallFieldClass}>
                          {Object.entries(ACCESS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" name="restricted" defaultChecked={m.restricted} className="size-4 accent-[#1b4dff]" />
                          Hiring manager limited to the roles ticked
                        </label>
                      </div>
                      {roleList.length ? (
                        <ul className="grid gap-1 sm:grid-cols-2">
                          {roleList.map((r) => (
                            <li key={r.id}>
                              <label className="flex items-center gap-2">
                                <input type="checkbox" name="roleIds" value={r.id} defaultChecked={theirs.includes(r.id)} className="size-4 accent-[#1b4dff]" />
                                {r.title}
                              </label>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <div>
                        <button type="submit" className={buttonClass("secondary", "sm")}>
                          Save
                        </button>
                      </div>
                    </form>
                    {m.userId !== c.user.id ? (
                      <div className="mt-2 flex gap-2">
                        <form action={updateMember}>
                          <input type="hidden" name="userId" value={m.userId} />
                          <input type="hidden" name="op" value={m.deactivatedAt ? "reactivate" : "deactivate"} />
                          <button type="submit" className={buttonClass("ghost", "sm")}>
                            {m.deactivatedAt ? "Reactivate" : "Deactivate"}
                          </button>
                        </form>
                        <form action={updateMember}>
                          <input type="hidden" name="userId" value={m.userId} />
                          <input type="hidden" name="op" value="remove" />
                          <button type="submit" className={buttonClass("danger", "sm")}>
                            Remove
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      {pending.length ? (
        <Card>
          <CardHead title="Pending invites" />
          <ul className="divide-y divide-hairline">
            {pending.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13.5px] sm:px-5">
                <span className="min-w-0">
                  {i.email} <span className="text-slate">· {ACCESS[i.access]} · expires {i.expiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  {admin ? <input readOnly aria-label={`Invite link for ${i.email}`} value={`${SITE}/console/invite/${i.token}`} className="mt-1 block w-full truncate rounded-[6px] bg-mist px-2 py-1 font-mono text-[11.5px] text-slate" /> : null}
                </span>
                {admin ? (
                  <form action={revokeInvite}>
                    <input type="hidden" name="id" value={i.id} />
                    <button type="submit" className={buttonClass("ghost", "sm")}>
                      Withdraw
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
