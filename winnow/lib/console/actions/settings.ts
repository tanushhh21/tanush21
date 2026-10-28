"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, integrations, invites, memberships, notificationPrefs, orgs, persons, reasonCodes, rightsRequests, roleAccess, roles, type Access, type CompBand } from "@/lib/db/schema";
import { assertCan, can, requireCtx } from "@/lib/console/context";
import { audit } from "@/lib/console/log";
import { createInvite } from "@/lib/console/invites";
import { TYPES } from "@/lib/console/notify";
import { RETENTION_KINDS } from "@/lib/console/privacy";
import { deleteStoredFile } from "@/lib/console/storage";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (section: string, saved: string) => redirect(`/console/settings/${section}?saved=${encodeURIComponent(saved)}`);

// ---- Organisation ----------------------------------------------------------------

/** "L3: 18-26" per line, in lakh, into bands in rupees. */
function parseBands(raw: string): CompBand[] {
  return raw
    .split("\n")
    .map((l) => l.match(/^\s*([^:]+?)\s*:\s*([\d.]+)\s*(?:-|–|to)\s*([\d.]+)/i))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ level: m[1].slice(0, 40), min: Math.round(Number(m[2]) * 100000), max: Math.round(Number(m[3]) * 100000) }));
}

export async function saveOrg(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.orgSettings, "Only an admin changes organisation settings.");
  const domain = str(form, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const careers = str(form, "careersEmail").toLowerCase();
  if (careers && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(careers)) back("organisation", "bad-email");
  const logo = str(form, "logoUrl");
  if (logo && !/^https:\/\//.test(logo)) back("organisation", "bad-logo");
  const patch = {
    name: str(form, "name").slice(0, 120) || c.org.name,
    domain: domain || null,
    careersEmail: careers || null,
    logoUrl: logo || null,
    locations: str(form, "locations").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30),
    levelLadder: str(form, "levelLadder").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30),
    compBands: parseBands(str(form, "compBands")),
    questionSender: str(form, "questionSender") === "company" ? ("company" as const) : ("winnow" as const),
    staleDays: Math.min(60, Math.max(1, Number(str(form, "staleDays")) || 5)),
  };
  await db.update(orgs).set(patch).where(eq(orgs.id, c.org.id));
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "org.update", entity: "org", entityId: c.org.id, detail: { fields: Object.keys(patch) } });
  revalidatePath("/console", "layout");
  back("organisation", "saved");
}

// ---- Team ---------------------------------------------------------------------------

export async function inviteMember(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.manageTeam, "Only an admin invites people.");
  const email = str(form, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("team", "bad-email");
  const access = (["hiring_manager", "ta", "admin"].includes(str(form, "access")) ? str(form, "access") : "hiring_manager") as Access;
  const roleIds = form.getAll("roleIds").map(String).filter(Boolean);
  const valid = roleIds.length ? (await db.select({ id: roles.id }).from(roles).where(and(eq(roles.orgId, c.org.id), inArray(roles.id, roleIds)))).map((r) => r.id) : [];
  const r = await createInvite({ orgId: c.org.id, orgName: c.org.name, email, access, roleIds: access === "hiring_manager" ? valid : [], invitedBy: c.user.id });
  back("team", r.sent.ok ? "invited" : "invite-not-sent");
}

export async function revokeInvite(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.manageTeam);
  await db.delete(invites).where(and(eq(invites.id, str(form, "id")), eq(invites.orgId, c.org.id), isNull(invites.acceptedAt)));
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "invite.revoke", entity: "invite", entityId: str(form, "id") });
  back("team", "revoked");
}

export async function updateMember(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.manageTeam);
  const userId = str(form, "userId");
  const m = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, c.org.id), eq(memberships.userId, userId)) });
  if (!m) back("team", "not-found");
  const op = str(form, "op");
  if (userId === c.user.id && op !== "access") back("team", "not-yourself");
  if (op === "access") {
    const access = (["hiring_manager", "ta", "admin"].includes(str(form, "access")) ? str(form, "access") : m!.access) as Access;
    if (userId === c.user.id && access !== "admin") back("team", "not-yourself");
    const restricted = access === "hiring_manager" && form.get("restricted") === "on";
    await db.update(memberships).set({ access, restricted }).where(eq(memberships.id, m!.id));
    const roleIds = form.getAll("roleIds").map(String).filter(Boolean);
    if (restricted) {
      const owned = (await db.select({ id: roles.id }).from(roles).where(eq(roles.orgId, c.org.id))).map((r) => r.id);
      await db.delete(roleAccess).where(and(eq(roleAccess.userId, userId), inArray(roleAccess.roleId, owned.length ? owned : ["00000000-0000-0000-0000-000000000000"])));
      const keep = roleIds.filter((r) => owned.includes(r));
      if (keep.length) await db.insert(roleAccess).values(keep.map((roleId) => ({ roleId, userId }))).onConflictDoNothing();
    }
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "member.access", entity: "user", entityId: userId, detail: { access, restricted, roleIds } });
    back("team", "saved");
  }
  if (op === "deactivate" || op === "reactivate") {
    await db.update(memberships).set({ deactivatedAt: op === "deactivate" ? new Date() : null }).where(eq(memberships.id, m!.id));
    await audit({ orgId: c.org.id, actorId: c.user.id, action: `member.${op}`, entity: "user", entityId: userId });
    back("team", op === "deactivate" ? "deactivated" : "reactivated");
  }
  if (op === "remove") {
    await db.delete(memberships).where(eq(memberships.id, m!.id));
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "member.remove", entity: "user", entityId: userId });
    back("team", "removed");
  }
  back("team", "saved");
}

// ---- Integrations --------------------------------------------------------------------

export async function saveSlack(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.integrations);
  const url = str(form, "webhook");
  if (url && !/^https:\/\/hooks\.slack\.com\/services\//.test(url)) back("integrations", "bad-slack");
  await db.update(orgs).set({ slackWebhook: url || null }).where(eq(orgs.id, c.org.id));
  await db
    .insert(integrations)
    .values({ orgId: c.org.id, kind: "slack", status: url ? "connected" : "disconnected", connectedAt: url ? new Date() : null })
    .onConflictDoUpdate({ target: [integrations.orgId, integrations.kind], set: { status: url ? "connected" : "disconnected", connectedAt: url ? new Date() : null } });
  if (url) await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `Winnow is connected for ${c.org.name}. Notifications you choose will arrive here.` }) }).catch(() => undefined);
  await audit({ orgId: c.org.id, actorId: c.user.id, action: url ? "integration.connect" : "integration.disconnect", entity: "integration", entityId: "slack" });
  back("integrations", url ? "slack-on" : "slack-off");
}

/**
 * The sending domain: added to Resend, which returns the DNS records the
 * company publishes. Verification is checked on demand.
 */
export async function emailDomain(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.integrations);
  const op = str(form, "op");
  const key = process.env.RESEND_API_KEY;
  const current = await db.query.integrations.findFirst({ where: and(eq(integrations.orgId, c.org.id), eq(integrations.kind, "email_domain")) });
  const save = (status: "connected" | "disconnected" | "error", config: Record<string, unknown>) =>
    db
      .insert(integrations)
      .values({ orgId: c.org.id, kind: "email_domain", status, config, connectedAt: status === "connected" ? new Date() : null })
      .onConflictDoUpdate({ target: [integrations.orgId, integrations.kind], set: { status, config, connectedAt: status === "connected" ? new Date() : null } });
  if (op === "disconnect") {
    await save("disconnected", {});
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "integration.disconnect", entity: "integration", entityId: "email_domain" });
    back("integrations", "domain-off");
  }
  if (!key) back("integrations", "no-resend");
  if (op === "add") {
    const domain = str(form, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) back("integrations", "bad-domain");
    const res = await fetch("https://api.resend.com/domains", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: `mail.${domain}`, region: "ap-northeast-1" }) });
    const data = (await res.json().catch(() => ({}))) as { id?: string; records?: unknown[]; message?: string };
    if (!res.ok || !data.id) {
      await save("error", { domain, error: data.message ?? `Resend said ${res.status}` });
      back("integrations", "domain-error");
    }
    await save("disconnected", { domain, sendingDomain: `mail.${domain}`, resendId: data.id, records: data.records ?? [], pending: true });
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "integration.request", entity: "integration", entityId: "email_domain", detail: { domain } });
    back("integrations", "domain-added");
  }
  if (op === "verify" && current?.config?.resendId) {
    const id = String(current.config.resendId);
    await fetch(`https://api.resend.com/domains/${id}/verify`, { method: "POST", headers: { Authorization: `Bearer ${key}` } });
    const res = await fetch(`https://api.resend.com/domains/${id}`, { headers: { Authorization: `Bearer ${key}` } });
    const data = (await res.json().catch(() => ({}))) as { status?: string; records?: unknown[] };
    const ok = data.status === "verified";
    await save(ok ? "connected" : "disconnected", { ...current.config, records: data.records ?? current.config.records, pending: !ok, lastCheck: new Date().toISOString(), resendStatus: data.status ?? "unknown" });
    back("integrations", ok ? "domain-on" : "domain-pending");
  }
  back("integrations", "saved");
}

/** ATS and calendar connections are set up with Winnow's team; this records the request. */
export async function requestIntegration(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.integrations);
  const kind = str(form, "kind") as "ats" | "calendar";
  if (!["ats", "calendar"].includes(kind)) back("integrations", "saved");
  const provider = str(form, "provider").slice(0, 60);
  await db
    .insert(integrations)
    .values({ orgId: c.org.id, kind, status: "disconnected", config: { requested: true, provider, by: c.user.email, at: new Date().toISOString() } })
    .onConflictDoUpdate({ target: [integrations.orgId, integrations.kind], set: { config: { requested: true, provider, by: c.user.email, at: new Date().toISOString() } } });
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "integration.request", entity: "integration", entityId: kind, detail: { provider } });
  back("integrations", "requested");
}

// ---- Reason codes ----------------------------------------------------------------------

export async function addReasonCode(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.orgSettings);
  const label = str(form, "label").slice(0, 80);
  if (!label) back("reasons", "missing");
  const applies = (["drop", "hold", "shortlist"].includes(str(form, "applies")) ? str(form, "applies") : "drop") as "drop" | "hold" | "shortlist";
  const code = `org_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40)}`;
  const exists = await db.query.reasonCodes.findFirst({ where: and(eq(reasonCodes.orgId, c.org.id), eq(reasonCodes.code, code)) });
  if (exists) await db.update(reasonCodes).set({ active: true, label, applies }).where(eq(reasonCodes.id, exists.id));
  else await db.insert(reasonCodes).values({ orgId: c.org.id, code, label, applies });
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "reason.add", entity: "reason_code", entityId: code, detail: { label, applies } });
  back("reasons", "added");
}

export async function toggleReasonCode(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.orgSettings);
  const id = str(form, "id");
  const row = await db.query.reasonCodes.findFirst({ where: and(eq(reasonCodes.id, id), eq(reasonCodes.orgId, c.org.id)) });
  if (row) {
    await db.update(reasonCodes).set({ active: !row.active }).where(eq(reasonCodes.id, row.id));
    await audit({ orgId: c.org.id, actorId: c.user.id, action: row.active ? "reason.retire" : "reason.restore", entity: "reason_code", entityId: row.code });
  }
  back("reasons", "saved");
}

// ---- Data and privacy --------------------------------------------------------------------


export async function saveRetention(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.dataSettings);
  const retention: Record<string, number> = {};
  for (const k of RETENTION_KINDS) {
    const v = Number(str(form, k.key));
    if (v) retention[k.key] = Math.min(3650, Math.max(30, Math.round(v)));
  }
  await db.update(orgs).set({ retention, shareWithWinnow: form.get("share") === "on" }).where(eq(orgs.id, c.org.id));
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "privacy.retention", entity: "org", entityId: c.org.id, detail: { retention, share: form.get("share") === "on" } });
  back("privacy", "saved");
}

export async function logRightsRequest(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.dataSettings);
  const requester = str(form, "requester").slice(0, 200);
  const kind = str(form, "kind") as "access" | "correction" | "erasure" | "withdraw_consent" | "grievance";
  if (!requester || !["access", "correction", "erasure", "withdraw_consent", "grievance"].includes(kind)) back("privacy", "missing");
  const email = requester.match(/[^\s<]+@[^\s>]+/)?.[0]?.toLowerCase();
  const person = email ? await db.query.persons.findFirst({ where: and(eq(persons.orgId, c.org.id), eq(persons.email, email)) }) : undefined;
  const [r] = await db.insert(rightsRequests).values({ orgId: c.org.id, personId: person?.id ?? null, requester, kind }).returning();
  await audit({ orgId: c.org.id, actorId: c.user.id, action: "rights.received", entity: "rights_request", entityId: r.id, detail: { kind, matched: Boolean(person) } });
  back("privacy", "logged");
}

/**
 * Resolves a rights request. Erasure deletes the person and everything about
 * them (applications, CVs, messages); the audit log keeps only that it happened.
 */
export async function resolveRightsRequest(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.dataSettings);
  const r = await db.query.rightsRequests.findFirst({ where: and(eq(rightsRequests.id, str(form, "id")), eq(rightsRequests.orgId, c.org.id)) });
  if (!r) back("privacy", "not-found");
  const status = str(form, "status") === "refused" ? "refused" : "done";
  const resolution = str(form, "resolution").slice(0, 1000);
  if (!resolution) back("privacy", "resolution-missing");
  if (status === "done" && r!.personId) {
    if (r!.kind === "erasure") await erase(c.org.id, r!.personId, c.user.id);
    if (r!.kind === "withdraw_consent") await db.update(persons).set({ consent: "withdrawn", consentAt: new Date() }).where(eq(persons.id, r!.personId));
  }
  await db.update(rightsRequests).set({ status, resolution, resolvedAt: new Date(), handledBy: c.user.id }).where(eq(rightsRequests.id, r!.id));
  await audit({ orgId: c.org.id, actorId: c.user.id, action: `rights.${status}`, entity: "rights_request", entityId: r!.id, detail: { kind: r!.kind } });
  back("privacy", "resolved");
}

async function erase(orgId: string, personId: string, actorId: string) {
  const files = await db.select({ url: documents.url }).from(documents).where(and(eq(documents.personId, personId), eq(documents.orgId, orgId)));
  for (const f of new Set(files.map((x) => x.url).filter(Boolean) as string[])) await deleteStoredFile(f).catch(() => undefined);
  await db.delete(persons).where(and(eq(persons.id, personId), eq(persons.orgId, orgId)));
  await audit({ orgId, actorId, action: "person.erase", entity: "person", entityId: personId });
}

export async function deleteCandidate(form: FormData) {
  const c = await requireCtx();
  assertCan(c, can.dataSettings);
  const email = str(form, "email").toLowerCase();
  if (str(form, "confirm") !== "DELETE") back("privacy", "confirm");
  const p = await db.query.persons.findFirst({ where: and(eq(persons.orgId, c.org.id), eq(persons.email, email)) });
  if (!p) back("privacy", "no-person");
  await erase(c.org.id, p!.id, c.user.id);
  await db.insert(rightsRequests).values({ orgId: c.org.id, requester: email, kind: "erasure", status: "done", resolution: "Deleted by an admin from Settings.", resolvedAt: new Date(), handledBy: c.user.id });
  back("privacy", "deleted");
}

// ---- Notifications -----------------------------------------------------------------------

export async function saveNotificationPrefs(form: FormData) {
  const c = await requireCtx();
  for (const t of TYPES) {
    const row = {
      userId: c.user.id,
      orgId: c.org.id,
      type: t.type,
      inApp: form.get(`${t.type}:inApp`) === "on",
      email: form.get(`${t.type}:email`) === "on",
      slack: form.get(`${t.type}:slack`) === "on",
      frequency: str(form, `${t.type}:frequency`) === "daily" ? ("daily" as const) : ("instant" as const),
    };
    await db
      .insert(notificationPrefs)
      .values(row)
      .onConflictDoUpdate({ target: [notificationPrefs.userId, notificationPrefs.orgId, notificationPrefs.type], set: { inApp: row.inApp, email: row.email, slack: row.slack, frequency: row.frequency } });
  }
  back("notifications", "saved");
}

