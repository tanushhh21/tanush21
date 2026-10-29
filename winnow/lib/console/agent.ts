/**
 * What the chat assistant can do, as tools that run with the asking person's
 * own access. Reading and setting up are done straight away; anything that
 * affects candidates or re-scores people (decisions, emails, criteria,
 * closing a role) is recorded as a proposal and runs only when the person
 * presses Confirm. Shared by the real assistant and the local stand-in.
 */
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, memberships, persons, roles, users, type ChatAction } from "@/lib/db/schema";
import { can, visibleRoles, type Ctx } from "@/lib/console/context";
import { summarizeRoles, closeRoleWith } from "@/lib/console/roles";
import { loadRanking, reasonsFor } from "@/lib/console/data/ranking";
import { loadCandidate } from "@/lib/console/data/candidate";
import { applyChanges, createVersion, impactOf, type RubricChange } from "@/lib/console/rubric";
import { currentRequirements } from "@/lib/console/scoring";
import { audit, logActivity } from "@/lib/console/log";
import { enqueue, pump } from "@/lib/console/jobs";
import { aiConfigured } from "@/lib/ai/claude";
import { addNote, decide } from "@/lib/console/actions/candidates";
import { askQuestions } from "@/lib/console/actions/questions";
import { matchOf, reasonLabel, statusOf } from "@/components/console/ranking/model";

export type AgentState = { actions: ChatAction[]; links: { label: string; href: string }[]; touched: Set<string> };
export type AgentTool = { name: string; description: string; schema: z.ZodObject; run: (input: never) => Promise<string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lakh = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100000));
const shortId = () => crypto.randomUUID().slice(0, 8);

export const SHORTLIST_REASONS = ["strong_match", "worth_a_conversation"] as const;
export const HOLD_REASONS = ["timing", "comparing", "awaiting_answer"] as const;
export const DROP_REASONS = ["below_bar", "missing_must_have", "comp_misaligned", "notice_too_long", "location", "not_interested", "no_response", "failed_verification", "interview_feedback", "someone_else", "role_closed", "other"] as const;

async function findRole(c: Ctx, id: string) {
  if (!UUID.test(id)) return null;
  const [r] = await db.select().from(roles).where(and(eq(roles.id, id), visibleRoles(c)));
  return r ?? null;
}

async function findApps(c: Ctx, ids: string[]) {
  const ok = ids.filter((i) => UUID.test(i));
  if (!ok.length) return [];
  return db
    .select({ id: applications.id, name: persons.name, roleId: roles.id, roleTitle: roles.title })
    .from(applications)
    .innerJoin(persons, eq(persons.id, applications.personId))
    .innerJoin(roles, eq(roles.id, applications.roleId))
    .where(and(inArray(applications.id, ok), visibleRoles(c)));
}

const names = (list: { name: string }[]) => (list.length <= 3 ? list.map((x) => x.name).join(", ").replace(/, ([^,]*)$/, " and $1") : `${list.length} candidates`);

/** A role in a few lines: basics, criteria, where people stand, and the top of the ranking. */
export async function roleSnapshot(c: Ctx, roleId: string, top = 15) {
  const role = await findRole(c, roleId);
  if (!role) return "No such role, or you cannot see it.";
  const [reqs, ranking] = await Promise.all([role.rubricVersion ? currentRequirements(role.id, role.rubricVersion) : Promise.resolve([]), loadRanking(role.id, role.rubricVersion)]);
  const rows = ranking.rows;
  const by = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  const lines = [
    `Role "${role.title}" (id ${role.id}), ${role.state}. Locations: ${role.locations.join(", ") || "not set"}. Openings: ${role.openings}. Pay band: ${role.compMin ? `₹${role.compMin / 100000}L` : "?"} to ${role.compMax ? `₹${role.compMax / 100000}L` : "?"}. Target date: ${role.targetDate ?? "not set"}.`,
    reqs.length
      ? `Criteria (version ${role.rubricVersion}):\n${reqs.map((q) => `- [${q.key}] ${q.text} (weight ${q.weight}${q.mustHave ? ", must-have" : ""})`).join("\n")}`
      : "Criteria: not built yet (Winnow builds them from the job description).",
    `Candidates: ${rows.length}. Undecided: ${by((r) => r.decision === "none")}. Shortlisted: ${by((r) => r.stage === "shortlisted")}. Interviewing: ${by((r) => r.stage === "interviewing")}. Offer out: ${by((r) => r.stage === "offer")}. Hired: ${by((r) => r.stage === "hired")}. On hold: ${by((r) => r.decision === "held")}. Dropped: ${by((r) => r.decision === "dropped")}. Could not be read: ${by((r) => r.status === "unreadable")}.`,
  ];
  const ranked = rows.filter((r) => r.rank != null && r.decision !== "dropped").sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).slice(0, top);
  if (ranked.length)
    lines.push(
      `Top of the ranking:\n${ranked.map((r) => `#${r.rank} ${r.name} (candidate id ${r.id}): match ${matchOf(r)}, ${statusOf(r).label}. Best: ${r.strength ?? "-"} Gap: ${r.gap ?? "-"}`).join("\n")}`,
    );
  return lines.join("\n\n");
}

/** The roles this person can see, one line each, for the assistant's context. */
export async function rolesLine(c: Ctx) {
  const list = await summarizeRoles(c, { includeClosed: true });
  return list.length ? list.map((r) => `- ${r.title} (id ${r.id}): ${r.status}, ${r.received} candidates, open ${r.daysOpen} days, manager ${r.hiringManager ?? "not set"}`).join("\n") : "No roles yet.";
}

export function agentTools(c: Ctx, scopeRoleId: string | null, state: AgentState): AgentTool[] {
  const propose = (a: Omit<ChatAction, "id" | "state">) => {
    const action: ChatAction = { ...a, id: shortId(), state: "proposed" };
    state.actions.push(action);
    return `Proposed: ${a.title}. The person sees a card with a Confirm button; nothing happens until they press it.`;
  };
  const roleArg = z.string().describe("The role's id, from the role list or a previous tool result.");

  const tools: AgentTool[] = [
    {
      name: "get_role",
      description: "Read one role: its basics, the criteria candidates are scored on, how many candidates are at each stage, and the top of the ranking with candidate ids.",
      schema: z.object({ role_id: roleArg }),
      run: async ({ role_id }: { role_id: string }) => roleSnapshot(c, role_id),
    },
    {
      name: "find_candidates",
      description:
        "Find candidates by name, or list them by status, in one role or across every role the person can see. Returns candidate ids, match (0-100), status and the one-line reasons.",
      schema: z.object({
        role_id: z.string().optional().describe("Limit to one role. Leave out to search every visible open role."),
        name: z.string().optional().describe("Part of a name, case does not matter."),
        status: z.enum(["any", "undecided", "shortlisted", "interviewing", "offer", "hired", "on_hold", "dropped", "check_claims"]).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      run: async (i: { role_id?: string; name?: string; status?: string; limit?: number }) => {
        const roleIds = i.role_id ? [i.role_id] : (await summarizeRoles(c)).map((r) => r.id);
        const out: string[] = [];
        for (const id of roleIds) {
          const role = await findRole(c, id);
          if (!role) continue;
          const { rows } = await loadRanking(role.id, role.rubricVersion);
          for (const r of rows) {
            if (i.name && !r.name.toLowerCase().includes(i.name.toLowerCase())) continue;
            const s = statusOf(r).label.toLowerCase();
            const want = i.status ?? "any";
            if (want === "undecided" && r.decision !== "none") continue;
            if (want === "check_claims" && !(r.decision === "none" && r.band === "needs_verification")) continue;
            if (want === "on_hold" && r.decision !== "held") continue;
            if (want === "dropped" && r.decision !== "dropped") continue;
            if (["shortlisted", "interviewing", "hired"].includes(want) && s !== want) continue;
            if (want === "offer" && r.stage !== "offer") continue;
            out.push(`${r.name} (candidate id ${r.id}) for ${role.title}: ${r.rank ? `#${r.rank}, ` : ""}match ${matchOf(r) ?? "not scored"}, ${statusOf(r).label}${r.reasonCode ? ` (${reasonLabel(r.reasonCode)})` : ""}. Best: ${r.strength ?? "-"} Gap: ${r.gap ?? "-"}`);
          }
        }
        return out.length ? out.slice(0, i.limit ?? 20).join("\n") : "Nobody matches.";
      },
    },
    {
      name: "get_candidate",
      description: "Read everything about one candidate for one role: each requirement with the CV quote, their CV facts (pay, notice, location), questions asked and answers, messages, notes, and anything contradictory.",
      schema: z.object({ candidate_id: z.string() }),
      run: async ({ candidate_id }: { candidate_id: string }) => {
        if (!UUID.test(candidate_id)) return "That is not a candidate id. Use find_candidates first.";
        const d = await loadCandidate(c, candidate_id);
        if (!d) return "No such candidate, or you cannot see them.";
        const h = d.header;
        return [
          `${d.person.name} for ${d.role.title}. ${h.rank ? `#${h.rank}, ` : ""}match ${matchOf({ score: h.score, confidence: h.confidence }) ?? "not scored"}. Decision: ${h.decision}${h.reasonCode ? ` (${reasonLabel(h.reasonCode)})` : ""}. Stage: ${h.stage}. Source: ${h.source}.`,
          `Best evidence: ${h.strength ?? "-"} Biggest gap: ${h.gap ?? "-"}`,
          `Against the criteria:\n${d.rubric.map((r) => `- ${r.text}${r.mustHave ? " (must-have)" : ""}: ${r.verdict}${r.quote ? `, "${r.quote}"` : ""}`).join("\n")}`,
          `From the CV: ${d.facts.filter((f) => f.value).map((f) => `${f.field}=${f.value}`).join("; ")}`,
          d.contradictions.length ? `Contradictions: ${d.contradictions.map((x) => `"${x.quoteA}" vs "${x.quoteB}"${x.resolved ? " (sorted)" : ""}`).join("; ")}` : "",
          d.questions.length ? `Questions: ${d.questions.map((q) => `${q.text} [${q.status}]${q.answer ? ` Answer: ${q.answer}` : ""}`).join(" | ")}` : "",
          d.notes.length ? `Notes: ${d.notes.map((n) => `${n.by}: ${n.body}`).join(" | ")}` : "",
          d.interviews.length ? `Interviews: ${d.interviews.map((i) => `${i.title} ${i.startAt.slice(0, 10)} ${i.status}`).join("; ")}` : "",
          d.debriefs.length ? `Interview feedback: ${d.debriefs.map((x) => `${x.by}: ${x.wouldHire}. ${x.strongest} Concern: ${x.concern}`).join(" | ")}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      },
    },
    {
      name: "create_role",
      description:
        "Set up a new role straight away from what the person said or pasted. Winnow then builds the screening criteria from the description by itself. Fill in only what they told you; everything else can stay empty.",
      schema: z.object({
        title: z.string().describe("The job title, e.g. Senior Backend Engineer."),
        description: z.string().describe("The job description as given, or a clear summary of everything the person said about the role, including must-haves."),
        locations: z.array(z.string()).optional(),
        openings: z.number().int().min(1).max(500).optional(),
        pay_min_lakh: z.number().optional().describe("Bottom of the pay band, in lakh per year."),
        pay_max_lakh: z.number().optional().describe("Top of the pay band, in lakh per year."),
        hiring_manager: z.string().optional().describe("Name or email of a teammate who manages this hire."),
        target_date: z.string().optional().describe("YYYY-MM-DD"),
      }),
      run: async (i: { title: string; description: string; locations?: string[]; openings?: number; pay_min_lakh?: number; pay_max_lakh?: number; hiring_manager?: string; target_date?: string }) => {
        if (!can.createRole(c)) return "This person cannot create roles (hiring managers ask their TA team).";
        const manager = i.hiring_manager ? await teammate(c, i.hiring_manager) : null;
        const [role] = await db
          .insert(roles)
          .values({
            orgId: c.org.id,
            title: i.title.trim().slice(0, 120) || "New role",
            jdText: i.description.slice(0, 30000),
            locations: (i.locations ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 10),
            openings: i.openings ?? 1,
            compMin: lakh(i.pay_min_lakh),
            compMax: lakh(i.pay_max_lakh),
            hiringManagerId: manager?.id ?? null,
            targetDate: i.target_date && /^\d{4}-\d{2}-\d{2}$/.test(i.target_date) ? i.target_date : null,
            createdBy: c.user.id,
            sources: [],
          })
          .returning();
        await audit({ orgId: c.org.id, actorId: c.user.id, action: "role.create", entity: "role", entityId: role.id, roleId: role.id, detail: { via: "chat" } });
        await logActivity({ orgId: c.org.id, roleId: role.id, kind: "role_created", message: "Role created from chat", actorId: c.user.id });
        if (aiConfigured()) {
          await enqueue("rubric", { orgId: c.org.id, roleId: role.id, payload: { roleId: role.id } });
          after(() => pump(50_000));
        }
        state.links.push({ label: `Open ${role.title}`, href: `/console/roles/${role.id}` });
        state.touched.add("/console");
        return `Created role "${role.title}" (id ${role.id}).${manager ? ` Hiring manager: ${manager.name}.` : i.hiring_manager ? ` No teammate called "${i.hiring_manager}", so no hiring manager is set.` : ""} Winnow is building the criteria now; CVs can be added from the role page or this chat.`;
      },
    },
    {
      name: "update_role",
      description: "Change a role's basics straight away: title, locations, openings, pay band, hiring manager or target date. Only the fields given change.",
      schema: z.object({
        role_id: roleArg,
        title: z.string().optional(),
        locations: z.array(z.string()).optional(),
        openings: z.number().int().min(1).max(500).optional(),
        pay_min_lakh: z.number().optional(),
        pay_max_lakh: z.number().optional(),
        hiring_manager: z.string().optional(),
        target_date: z.string().optional(),
      }),
      run: async (i: { role_id: string; title?: string; locations?: string[]; openings?: number; pay_min_lakh?: number; pay_max_lakh?: number; hiring_manager?: string; target_date?: string }) => {
        if (!can.editRoleSettings(c)) return "This person cannot change role settings.";
        const role = await findRole(c, i.role_id);
        if (!role) return "No such role.";
        const manager = i.hiring_manager ? await teammate(c, i.hiring_manager) : null;
        if (i.hiring_manager && !manager) return `No teammate called "${i.hiring_manager}". Nothing changed.`;
        const set: Partial<typeof roles.$inferInsert> = {};
        if (i.title) set.title = i.title.slice(0, 120);
        if (i.locations) set.locations = i.locations.map((l) => l.trim()).filter(Boolean);
        if (i.openings) set.openings = i.openings;
        if (i.pay_min_lakh != null) set.compMin = lakh(i.pay_min_lakh);
        if (i.pay_max_lakh != null) set.compMax = lakh(i.pay_max_lakh);
        if (manager) set.hiringManagerId = manager.id;
        if (i.target_date && /^\d{4}-\d{2}-\d{2}$/.test(i.target_date)) set.targetDate = i.target_date;
        if (!Object.keys(set).length) return "Nothing to change.";
        await db.update(roles).set(set).where(eq(roles.id, role.id));
        await audit({ orgId: c.org.id, actorId: c.user.id, action: "role.basics", entity: "role", entityId: role.id, roleId: role.id, detail: { via: "chat", fields: Object.keys(set) } });
        state.touched.add(`/console/roles/${role.id}`);
        return `Updated ${Object.keys(set).join(", ")} on ${set.title ?? role.title}.`;
      },
    },
    {
      name: "add_note",
      description: "Add a note to a candidate straight away. The team sees notes; @FirstName tells someone.",
      schema: z.object({ candidate_id: z.string(), text: z.string() }),
      run: async ({ candidate_id, text }: { candidate_id: string; text: string }) => {
        const [app] = await findApps(c, [candidate_id]);
        if (!app) return "No such candidate.";
        const r = await addNote(app.id, text);
        state.touched.add(`/console/c/${app.id}`);
        return r.ok ? `Added the note to ${app.name}.` : r.error;
      },
    },
    {
      name: "propose_decision",
      description:
        "Propose shortlisting, holding or dropping one or more candidates. Shows the person a Confirm card. Reasons: shortlist uses strong_match or worth_a_conversation; hold uses timing, comparing or awaiting_answer; drop uses below_bar, missing_must_have, comp_misaligned, notice_too_long, location, not_interested, no_response, failed_verification, interview_feedback, someone_else, role_closed or other.",
      schema: z.object({
        candidate_ids: z.array(z.string()).min(1).max(50),
        decision: z.enum(["shortlist", "hold", "drop"]),
        reason: z.string(),
        note: z.string().optional(),
      }),
      run: async (i: { candidate_ids: string[]; decision: "shortlist" | "hold" | "drop"; reason: string; note?: string }) => {
        if (!can.decide(c)) return "This person cannot make decisions.";
        const apps = await findApps(c, i.candidate_ids);
        if (!apps.length) return "None of those candidates were found. Use find_candidates for their ids.";
        const reasons = await reasonsFor(c.org.id);
        const applies = i.decision === "shortlist" ? "shortlist" : i.decision === "hold" ? "hold" : "drop";
        const code = reasons.find((r) => (r.code === i.reason || r.label.toLowerCase() === i.reason.toLowerCase()) && (r.applies === applies || r.applies === "any"));
        if (!code) return `"${i.reason}" is not a ${applies} reason. Use one of: ${reasons.filter((r) => r.applies === applies || r.applies === "any").map((r) => r.code).join(", ")}.`;
        const verb = { shortlist: "Shortlist", hold: "Put on hold", drop: "Drop" }[i.decision];
        return propose({
          kind: "decide",
          title: `${verb} ${names(apps)}`,
          detail: [`Reason: ${code.label}`, ...(i.note ? [`Note: ${i.note}`] : []), ...(apps.length > 3 ? [apps.map((a) => a.name).join(", ")] : [])],
          input: { ids: apps.map((a) => a.id), decision: i.decision === "shortlist" ? "shortlisted" : i.decision === "hold" ? "held" : "dropped", reasonCode: code.code, note: i.note ?? "" },
        });
      },
    },
    {
      name: "propose_questions",
      description: "Propose emailing one question to one or more candidates, to check a claim or fill a gap in their CV. Shows a Confirm card; the email goes only when the person confirms.",
      schema: z.object({ candidate_ids: z.array(z.string()).min(1).max(50), question: z.string() }),
      run: async (i: { candidate_ids: string[]; question: string }) => {
        if (!can.sendQuestions(c)) return "This person cannot send questions to candidates.";
        const apps = await findApps(c, i.candidate_ids);
        if (!apps.length) return "None of those candidates were found.";
        return propose({ kind: "ask", title: `Email ${names(apps)} a question`, detail: [`“${i.question.trim()}”`], input: { ids: apps.map((a) => a.id), question: i.question.trim().slice(0, 600) } });
      },
    },
    {
      name: "propose_criteria_change",
      description:
        "Propose changing what a role screens on: set_weight (1-5), set_must_have, add a requirement in plain words with keywords, remove, edit_text, or add_keywords. Use the requirement keys from get_role. Shows the effect on the ranking and a Confirm card; confirming re-scores everyone. Never screen on age, gender, marital status, religion, caste, region of origin, disability or photographs.",
      schema: z.object({
        role_id: roleArg,
        summary: z.string().describe("One line saying what changes, e.g. Make on-call experience a must-have."),
        changes: z.array(
          z.object({
            op: z.enum(["set_weight", "set_must_have", "add", "remove", "edit_text", "add_keywords"]),
            key: z.string().nullable().describe("The requirement key; null when adding."),
            text: z.string().nullable(),
            weight: z.number().int().min(1).max(5).nullable(),
            must_have: z.boolean().nullable(),
            keywords: z.array(z.string()),
          }),
        ),
      }),
      run: async (i: { role_id: string; summary: string; changes: RubricChange[] }) => {
        if (!can.editRubric(c)) return "This person cannot change the criteria. The TA team can.";
        const role = await findRole(c, i.role_id);
        if (!role || role.rubricVersion === 0) return "That role has no criteria yet.";
        const current = await currentRequirements(role.id, role.rubricVersion);
        const items = applyChanges(current.map((q) => ({ ...q })), i.changes);
        const impact = await impactOf(role.id, items);
        const OP: Record<string, string> = { set_weight: "Weight", set_must_have: "Must-have", add: "Add", remove: "Remove", edit_text: "Reword", add_keywords: "Also look for" };
        const label = (ch: RubricChange) => {
          const q = current.find((x) => x.key === ch.key);
          const what = ch.op === "add" ? ch.text : q?.text ?? ch.key;
          const to = ch.op === "set_weight" ? ` → ${ch.weight}` : ch.op === "set_must_have" ? (ch.must_have ? " → yes" : " → no") : ch.op === "edit_text" ? ` → “${ch.text}”` : ch.op === "add_keywords" ? `: ${ch.keywords.join(", ")}` : "";
          return `${OP[ch.op] ?? ch.op}: ${what}${to}`;
        };
        return propose({
          kind: "criteria",
          title: `${i.summary} (${role.title})`,
          detail: [
            ...i.changes.map(label),
            `Effect: ${impact.moved} ${impact.moved === 1 ? "person changes" : "people change"} place${impact.enteredTop.length ? `; into the top: ${impact.enteredTop.join(", ")}` : ""}${impact.leftTop.length ? `; out of the top: ${impact.leftTop.join(", ")}` : ""}.`,
          ],
          input: { roleId: role.id, summary: i.summary, changes: i.changes },
        });
      },
    },
    {
      name: "propose_close_role",
      description: "Propose closing a role (filled or cancelled) or putting it on hold. When filled, name who was hired by candidate id. Shows a Confirm card.",
      schema: z.object({ role_id: roleArg, reason: z.enum(["filled", "cancelled", "on_hold"]), hired_candidate_ids: z.array(z.string()).optional(), note: z.string().optional() }),
      run: async (i: { role_id: string; reason: "filled" | "cancelled" | "on_hold"; hired_candidate_ids?: string[]; note?: string }) => {
        if (!can.editRoleSettings(c)) return "This person cannot close roles.";
        const role = await findRole(c, i.role_id);
        if (!role) return "No such role.";
        const hired = await findApps(c, i.hired_candidate_ids ?? []);
        const verb = { filled: "Close as filled", cancelled: "Close as cancelled", on_hold: "Put on hold" }[i.reason];
        return propose({
          kind: "close",
          title: `${verb}: ${role.title}`,
          detail: [...(hired.length ? [`Hired: ${names(hired)}`] : []), ...(i.note ? [`Note: ${i.note}`] : [])],
          input: { roleId: role.id, reason: i.reason, hired: hired.filter((h) => h.roleId === role.id).map((h) => h.id), note: i.note ?? "" },
        });
      },
    },
  ];
  // In a role's own conversation, the role is the default everywhere.
  if (scopeRoleId) tools.unshift({ ...tools[0], name: "get_this_role", description: "Read the role this conversation is about.", schema: z.object({}), run: async () => roleSnapshot(c, scopeRoleId) });
  return tools;
}

async function teammate(c: Ctx, who: string) {
  const team = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, c.org.id));
  const w = who.trim().toLowerCase();
  return team.find((t) => t.email?.toLowerCase() === w) ?? team.find((t) => (t.name ?? "").toLowerCase() === w) ?? team.find((t) => (t.name ?? "").toLowerCase().startsWith(w)) ?? null;
}

/** Runs a proposal the person confirmed, with their access checked again now. */
export async function runAction(c: Ctx, a: ChatAction): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const i = a.input as Record<string, unknown>;
  if (a.kind === "decide") {
    const r = await decide({ ids: i.ids as string[], decision: i.decision as "shortlisted" | "held" | "dropped", reasonCode: String(i.reasonCode), note: String(i.note ?? "") });
    return r.ok ? { ok: true, result: "Done." } : { ok: false, error: r.error };
  }
  if (a.kind === "ask") {
    const ids = i.ids as string[];
    const r = await askQuestions(ids.map((applicationId) => ({ applicationId, items: [{ requirementKey: null, text: String(i.question) }] })), true);
    if (!r.ok) return { ok: false, error: r.error };
    const failed = (r as { failed?: string[] }).failed ?? [];
    return failed.length ? { ok: false, error: failed.join(" ") } : { ok: true, result: `Sent to ${ids.length}.` };
  }
  if (a.kind === "criteria") {
    if (!can.editRubric(c)) return { ok: false, error: "You cannot change the criteria." };
    const role = await findRole(c, String(i.roleId));
    if (!role) return { ok: false, error: "The role is gone." };
    const current = await currentRequirements(role.id, role.rubricVersion);
    const items = applyChanges(current.map((q) => ({ ...q })), i.changes as RubricChange[]);
    const v = await createVersion(role.id, items, "chat", String(i.summary), c.user.id);
    await audit({ orgId: c.org.id, actorId: c.user.id, action: "rubric.chat", entity: "role", entityId: role.id, roleId: role.id, rubricVersion: v.version, detail: { summary: i.summary, changes: i.changes } });
    await logActivity({ orgId: c.org.id, roleId: role.id, kind: "rubric_changed", message: `Criteria v${v.version} from chat: ${i.summary}`, actorId: c.user.id });
    after(() => pump(50_000));
    revalidatePath(`/console/roles/${role.id}`, "layout");
    return { ok: true, result: `Saved as version ${v.version}. Everyone is being re-scored.` };
  }
  if (a.kind === "close") {
    if (!can.editRoleSettings(c)) return { ok: false, error: "You cannot close roles." };
    const role = await findRole(c, String(i.roleId));
    if (!role) return { ok: false, error: "The role is gone." };
    await closeRoleWith(c, role, i.reason as "filled" | "cancelled" | "on_hold", (i.hired as string[]) ?? [], String(i.note ?? ""));
    revalidatePath("/console", "layout");
    return { ok: true, result: i.reason === "on_hold" ? "On hold." : "Closed." };
  }
  return { ok: false, error: "Unknown action." };
}
