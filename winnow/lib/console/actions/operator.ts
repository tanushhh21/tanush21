"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, booleanSearches, documents, mergeCandidates, notes, observations, orgs, outreach, personIdentities, persons, roleSources, roles, searchResults, talentPoolMembers } from "@/lib/db/schema";
import { requireUser } from "@/lib/console/context";
import { audit, logActivity } from "@/lib/console/log";
import { enqueue, pump } from "@/lib/console/jobs";
import { putFile } from "@/lib/console/storage";
import { ACCEPTED, MAX_BYTES, mimeFor } from "@/lib/console/parse";
import { learnedCut, rankerFor } from "@/lib/console/data/operator";
import { touchRole } from "@/lib/console/roles";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });

async function operator() {
  const u = await requireUser();
  if (!u.isOperator) redirect("/console");
  return u;
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = (path: string, msg: string) => {
  revalidatePath("/console/operator", "layout");
  redirect(`/console/operator/${path}?saved=${encodeURIComponent(msg)}`);
};

// ---- Searches ---------------------------------------------------------------------

export async function markSearch(form: FormData) {
  const u = await operator();
  const status = str(form, "status") === "skipped" ? "skipped" : "run";
  await db.update(booleanSearches).set({ status, ranAt: new Date(), ranBy: u.id }).where(eq(booleanSearches.id, str(form, "id")));
  done("searches", status === "run" ? "Marked as run" : "Skipped");
}

/**
 * Results pasted from a search, one per line: "Name | headline | url | snippet".
 * Each is scored against the role's rubric, and the recommended cut line is
 * drawn where operators have drawn it before for this role.
 */
export async function addResults(form: FormData) {
  const u = await operator();
  const s = await db.query.booleanSearches.findFirst({ where: eq(booleanSearches.id, str(form, "id")) });
  if (!s) done("searches", "Search not found");
  const lines = str(form, "results")
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter((p) => p[0]);
  if (!lines.length) done("searches", "Paste at least one result");
  const rank = await rankerFor(s!.roleId);
  const cut = await learnedCut(s!.roleId);
  await db.insert(searchResults).values(
    lines.slice(0, 200).map(([name, headline, url, ...rest]) => {
      const snippet = rest.join(" | ") || null;
      const score = rank(`${headline ?? ""} ${snippet ?? ""}`);
      return { searchId: s!.id, name: name.slice(0, 120), headline: headline?.slice(0, 300) || null, url: /^https?:\/\//.test(url ?? "") ? url : null, snippet: snippet?.slice(0, 1000) ?? null, score, aboveCut: score >= cut };
    }),
  );
  await db.update(booleanSearches).set({ status: "run", ranAt: new Date(), ranBy: u.id }).where(eq(booleanSearches.id, s!.id));
  await logActivity({ orgId: s!.orgId, roleId: s!.roleId, kind: "sourcing_results", message: `Sourcing: ${lines.length} results from ${s!.target}`, actorId: u.id });
  done("triage", `Added ${lines.length} results; the cut line is at ${Math.round(cut * 100)}%`);
}

// ---- Triage -----------------------------------------------------------------------

/** Moving the cut line is a training signal: the threshold is learned per role. */
export async function moveCut(searchId: string, resultId: string): Promise<Result> {
  try {
    const u = await operator();
    const s = await db.query.booleanSearches.findFirst({ where: eq(booleanSearches.id, searchId) });
    if (!s) throw new Error("Not found.");
    const list = await db.select().from(searchResults).where(eq(searchResults.searchId, searchId));
    const at = list.find((r) => r.id === resultId);
    if (!at) throw new Error("Not found.");
    const threshold = at.score ?? 0;
    const before = list.filter((r) => r.aboveCut).length;
    await db.update(searchResults).set({ aboveCut: sql`coalesce(${searchResults.score}, 0) >= ${threshold}` }).where(eq(searchResults.searchId, searchId));
    const after = list.filter((r) => (r.score ?? 0) >= threshold).length;
    await db.insert(observations).values({ orgId: s.orgId, kind: "cut_line", roleId: s.roleId, payload: { searchId, threshold, before, after }, createdBy: u.id });
    revalidatePath("/console/operator/triage");
    return { ok: true, message: `Cut moved: ${after} above the line (was ${before}). Learned for this role.` };
  } catch (e) {
    return fail(e);
  }
}

export async function markOpened(resultId: string): Promise<Result> {
  await operator();
  await db.update(searchResults).set({ opened: true }).where(eq(searchResults.id, resultId));
  return { ok: true };
}

/** Drafts outreach for everyone above the line; a person always sends it. */
export async function draftOutreach(searchId: string): Promise<Result> {
  try {
    const u = await operator();
    const s = await db.query.booleanSearches.findFirst({ where: eq(booleanSearches.id, searchId) });
    if (!s) throw new Error("Not found.");
    const role = await db.query.roles.findFirst({ where: eq(roles.id, s.roleId) });
    const org = await db.query.orgs.findFirst({ where: eq(orgs.id, s.orgId) });
    const above = await db
      .select()
      .from(searchResults)
      .where(and(eq(searchResults.searchId, searchId), eq(searchResults.aboveCut, true), sql`not exists (select 1 from ${outreach} where ${outreach.resultId} = ${searchResults.id})`));
    const loc = role?.locations[0] ? ` in ${role.locations[0]}` : "";
    if (above.length)
      await db.insert(outreach).values(
        above.map((r) => ({
          orgId: s.orgId,
          roleId: s.roleId,
          resultId: r.id,
          toName: r.name,
          channel: s.target,
          draft: `Hi ${r.name.split(" ")[0]}, ${r.headline ? `I came across your work as ${r.headline.replace(/\.$/, "")} and ` : ""}I think you could be a strong fit for a ${role?.title ?? "role"} at ${org?.name ?? "a company I work with"}${loc}. Would you be open to a short conversation? I'm with Winnow, who help them hire.`,
        })),
      );
    await audit({ orgId: s.orgId, actorId: u.id, action: "sourcing.draft", entity: "boolean_search", entityId: s.id, roleId: s.roleId, detail: { drafted: above.length } });
    revalidatePath("/console/operator", "layout");
    return { ok: true, message: `Drafted ${above.length} message${above.length === 1 ? "" : "s"}. Review and send them in Outreach.` };
  } catch (e) {
    return fail(e);
  }
}

// ---- Outreach and replies -------------------------------------------------------------

export async function saveOutreach(form: FormData) {
  const u = await operator();
  const id = str(form, "id");
  const op = str(form, "op");
  const o = await db.query.outreach.findFirst({ where: eq(outreach.id, id) });
  if (!o) done("outreach", "Not found");
  if (op === "discard") {
    await db.delete(outreach).where(eq(outreach.id, id));
    done("outreach", "Discarded");
  }
  const draft = str(form, "draft").slice(0, 3000) || o!.draft;
  if (op === "sent") {
    await db.update(outreach).set({ draft, status: "sent", sentAt: new Date(), sentBy: u.id }).where(eq(outreach.id, id));
    await logActivity({ orgId: o!.orgId, roleId: o!.roleId, kind: "outreach_sent", message: `Sourcing: messaged ${o!.toName} on ${o!.channel}`, actorId: u.id });
    done("outreach", `Recorded as sent to ${o!.toName}`);
  }
  await db.update(outreach).set({ draft }).where(eq(outreach.id, id));
  done("outreach", "Saved");
}

export async function recordReply(form: FormData) {
  await operator();
  const id = str(form, "id");
  const reply = str(form, "reply").slice(0, 4000);
  if (!reply) done("replies", "Paste the reply");
  await db.update(outreach).set({ reply, status: "replied" }).where(and(eq(outreach.id, id), eq(outreach.status, "sent")));
  done("replies", "Reply recorded");
}

/**
 * Processing a reply: an interested person becomes a candidate on the role,
 * read and scored like any other, from the profile or CV pasted here.
 */
export async function processReply(form: FormData) {
  const u = await operator();
  const o = await db.query.outreach.findFirst({ where: and(eq(outreach.id, str(form, "id")), eq(outreach.status, "replied")) });
  if (!o) done("replies", "Not found");
  const outcome = str(form, "outcome");
  if (outcome === "interested") {
    const text = str(form, "profile");
    if (text.length < 40) done("replies", "Paste their CV or profile so Winnow can read and score it");
    const email = str(form, "email").toLowerCase() || null;
    const role = await db.query.roles.findFirst({ where: eq(roles.id, o!.roleId) });
    let [source] = await db.select().from(roleSources).where(and(eq(roleSources.roleId, o!.roleId), eq(roleSources.kind, "winnow_sourcing")));
    if (!source) [source] = await db.insert(roleSources).values({ roleId: o!.roleId, kind: "winnow_sourcing", label: "Winnow sourcing" }).returning();
    const [person] = await db.insert(persons).values({ orgId: o!.orgId, name: o!.toName, email }).returning();
    const [app] = await db.insert(applications).values({ orgId: o!.orgId, roleId: o!.roleId, personId: person.id, source: "winnow_sourcing", sourceId: source.id, interest: "interested" }).returning();
    const filename = `${o!.toName.replace(/[^\w]+/g, "_")}_profile.txt`;
    const url = await putFile(`${o!.orgId}/${app.id}/${filename}`, Buffer.from(text), "text/plain");
    const [doc] = await db.insert(documents).values({ orgId: o!.orgId, personId: person.id, applicationId: app.id, roleId: o!.roleId, kind: "cv", filename, mime: "text/plain", size: text.length, url }).returning();
    await enqueue("parse", { orgId: o!.orgId, roleId: o!.roleId, payload: { applicationId: app.id, documentId: doc.id } });
    after(() => pump(50_000));
    if (role) await touchRole(role.id);
    await db.update(outreach).set({ status: "processed", personId: person.id }).where(eq(outreach.id, o!.id));
    await logActivity({ orgId: o!.orgId, roleId: o!.roleId, kind: "sourced_candidate", message: `Sourced: ${o!.toName} is interested and was added`, actorId: u.id, detail: { applicationId: app.id } });
    done("replies", `${o!.toName} added to ${role?.title ?? "the role"}; Winnow is reading their profile`);
  }
  await db.update(outreach).set({ status: "processed" }).where(eq(outreach.id, o!.id));
  await logActivity({ orgId: o!.orgId, roleId: o!.roleId, kind: "outreach_closed", message: `Sourcing: ${o!.toName} ${outcome === "later" ? "asked to be contacted later" : "is not interested"}`, actorId: u.id });
  done("replies", "Processed");
}

// ---- Parse failures ---------------------------------------------------------------------

/** Fix by hand: a readable file, or the text pasted in. Then it is read and scored as usual. */
export async function fixParse(form: FormData) {
  const u = await operator();
  const app = await db.query.applications.findFirst({ where: eq(applications.id, str(form, "id")) });
  if (!app) done("parse", "Not found");
  if (str(form, "op") === "unfixable") {
    await db.update(applications).set({ reasonCode: "unfixable" }).where(eq(applications.id, app!.id));
    await db.insert(notes).values({ applicationId: app!.id, authorId: u.id, body: `Winnow could not read this file: ${str(form, "note") || "no readable version available"}.` });
    done("parse", "Left as unreadable, with a note to the customer");
  }
  const file = form.get("file");
  let name: string;
  let data: Buffer;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) done("parse", "That file is too large");
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED.includes(ext)) done("parse", `Files of type ${ext} cannot be read`);
    name = file.name;
    data = Buffer.from(await file.arrayBuffer());
  } else {
    const text = str(form, "text");
    if (text.length < 40) done("parse", "Upload a readable file or paste the CV text");
    name = "cv_fixed_by_hand.txt";
    data = Buffer.from(text);
  }
  const url = await putFile(`${app!.orgId}/${app!.id}/${Date.now()}_${name.replace(/[^\w.]+/g, "_")}`, data, mimeFor(name));
  const [doc] = await db.insert(documents).values({ orgId: app!.orgId, personId: app!.personId, applicationId: app!.id, roleId: app!.roleId, kind: "cv", filename: name, mime: mimeFor(name), size: data.length, url }).returning();
  await db.update(applications).set({ parseStatus: "pending", parseError: null }).where(eq(applications.id, app!.id));
  await enqueue("parse", { orgId: app!.orgId, roleId: app!.roleId, payload: { applicationId: app!.id, documentId: doc.id } });
  after(() => pump(50_000));
  await logActivity({ orgId: app!.orgId, roleId: app!.roleId, kind: "parse_fixed", message: `Winnow fixed an unreadable file by hand (${name})`, actorId: u.id, detail: { applicationId: app!.id } });
  done("parse", "Fixed; it is being read now");
}

// ---- Entity merges ----------------------------------------------------------------------

/** Merging moves everything from B onto A and leaves B pointing at A. */
export async function resolveMerge(form: FormData) {
  const u = await operator();
  const m = await db.query.mergeCandidates.findFirst({ where: and(eq(mergeCandidates.id, str(form, "id")), eq(mergeCandidates.status, "open")) });
  if (!m) done("merges", "Not found");
  if (str(form, "op") !== "merge") {
    await db.update(mergeCandidates).set({ status: "distinct" }).where(eq(mergeCandidates.id, m!.id));
    await audit({ orgId: m!.orgId, actorId: u.id, action: "person.distinct", entity: "person", entityId: m!.personA, detail: { other: m!.personB } });
    done("merges", "Kept as two people");
  }
  const [a, b] = await Promise.all([db.query.persons.findFirst({ where: eq(persons.id, m!.personA) }), db.query.persons.findFirst({ where: eq(persons.id, m!.personB) })]);
  if (!a || !b) done("merges", "One of them no longer exists");
  await db.transaction(async (tx) => {
    await tx.update(applications).set({ personId: a!.id }).where(eq(applications.personId, b!.id));
    await tx.update(documents).set({ personId: a!.id }).where(eq(documents.personId, b!.id));
    await tx.update(personIdentities).set({ personId: a!.id }).where(eq(personIdentities.personId, b!.id));
    await tx.update(observations).set({ personId: a!.id }).where(eq(observations.personId, b!.id));
    const pools = await tx.select().from(talentPoolMembers).where(eq(talentPoolMembers.personId, b!.id));
    if (pools.length) await tx.insert(talentPoolMembers).values(pools.map((p) => ({ ...p, personId: a!.id }))).onConflictDoNothing();
    await tx
      .update(persons)
      .set({ email: a!.email ?? b!.email, phone: a!.phone ?? b!.phone, city: a!.city ?? b!.city, links: [...new Set([...a!.links, ...b!.links])], tags: [...new Set([...a!.tags, ...b!.tags])] })
      .where(eq(persons.id, a!.id));
    await tx.update(persons).set({ mergedInto: a!.id }).where(eq(persons.id, b!.id));
    await tx.update(mergeCandidates).set({ status: "merged" }).where(or(eq(mergeCandidates.id, m!.id), and(eq(mergeCandidates.status, "open"), inArray(mergeCandidates.personB, [b!.id]))));
  });
  await audit({ orgId: m!.orgId, actorId: u.id, action: "person.merge", entity: "person", entityId: a!.id, detail: { merged: b!.id, reason: m!.reason } });
  done("merges", `Merged into ${a!.name}`);
}

// One action per button: a submit button's own name and value do not reach a
// server action, so each choice is its own entry point.
const as = (key: string, value: string, fn: (f: FormData) => Promise<unknown>) => async (form: FormData) => {
  form.set(key, value);
  await fn(form);
};
export async function outreachSent(form: FormData) {
  await as("op", "sent", saveOutreach)(form);
}
export async function outreachDiscard(form: FormData) {
  await as("op", "discard", saveOutreach)(form);
}
export async function replyInterested(form: FormData) {
  await as("outcome", "interested", processReply)(form);
}
export async function replyLater(form: FormData) {
  await as("outcome", "later", processReply)(form);
}
export async function replyNo(form: FormData) {
  await as("outcome", "no", processReply)(form);
}
export async function mergeSame(form: FormData) {
  await as("op", "merge", resolveMerge)(form);
}
export async function mergeDistinct(form: FormData) {
  await as("op", "distinct", resolveMerge)(form);
}
export async function parseUnfixable(form: FormData) {
  await as("op", "unfixable", fixParse)(form);
}
