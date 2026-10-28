import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { invites, type Access } from "@/lib/db/schema";
import { layout, sendEmail } from "./email";
import { audit } from "./log";

export const SITE = process.env.SITE_URL || (process.env.VERCEL ? "https://getwinnow.in" : "http://localhost:3000");

export const token = (bytes = 24) => randomBytes(bytes).toString("base64url");

const ACCESS_LABEL: Record<Access, string> = { hiring_manager: "hiring manager", ta: "talent acquisition", admin: "admin" };

export async function createInvite(i: { orgId: string; orgName: string; email: string; access: Access; roleIds: string[]; invitedBy: string }) {
  const t = token();
  const [row] = await db
    .insert(invites)
    .values({
      orgId: i.orgId,
      email: i.email.toLowerCase(),
      access: i.access,
      roleIds: i.roleIds,
      token: t,
      invitedBy: i.invitedBy,
      expiresAt: new Date(Date.now() + 14 * 86_400_000),
    })
    .returning();
  const url = `${SITE}/console/invite/${t}`;
  const sent = await sendEmail({
    to: i.email,
    subject: `You're invited to ${i.orgName} on Winnow`,
    text: `You have been invited to join ${i.orgName} on Winnow as ${ACCESS_LABEL[i.access]}.\n\nAccept: ${url}\n\nThe invite expires in 14 days.`,
    html: layout([`You have been invited to join ${i.orgName} on Winnow as ${ACCESS_LABEL[i.access]}.`, "The invite expires in 14 days."], {
      label: "Accept the invite",
      href: url,
    }),
  });
  await audit({ orgId: i.orgId, actorId: i.invitedBy, action: "invite.create", entity: "invite", entityId: row.id, detail: { email: i.email, access: i.access, roleIds: i.roleIds } });
  return { invite: row, url, sent };
}
