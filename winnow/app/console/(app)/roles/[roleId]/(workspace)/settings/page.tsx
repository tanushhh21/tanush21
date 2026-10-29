import type { Metadata } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, orgs, persons, roleAccess, roleSources } from "@/lib/db/schema";
import { can, requireCtx, requireRole } from "@/lib/console/context";
import { closeRole, deleteRoleSource, reopenRole, saveBasics, saveRoleSource, saveVisibility, setQuestionSenderForm } from "@/lib/console/actions/roles";
import { teamFor } from "@/lib/console/team";
import { SOURCE_LABEL } from "@/components/console/ranking/model";
import { Card, CardHead, Empty, Field, buttonClass, fieldClass } from "@/components/console/ui";

export const metadata: Metadata = { title: "Role settings" };

const lakh = (n: number | null) => (n == null ? "" : String(Math.round((n / 100000) * 10) / 10));

const SAVED: Record<string, string> = {
  basics: "Saved.",
  visibility: "Saved who can see this role.",
  sources: "Sources saved.",
  sender: "Saved who sends questions.",
  closed: "The role is closed. It stays here, read-only, with everything that happened.",
  held: "The role is on hold. Nothing is sent while it is held.",
  reopened: "The role is open again.",
  "hire-missing": "Pick who was hired, or tick that they came from outside Winnow.",
  "reason-missing": "Pick why the role is closing.",
  "source-missing": "Give the source a name.",
};

export default async function RoleSettings({ params, searchParams }: { params: Promise<{ roleId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const c = await requireCtx();
  const role = await requireRole(c, (await params).roleId);
  const saved = (await searchParams).saved;
  if (!can.editRoleSettings(c))
    return <Empty title="Only the TA team changes role settings">Ask them if something here needs to change.</Empty>;
  const [team, sources, access, org, finalists] = await Promise.all([
    teamFor(c.org.id),
    db.select().from(roleSources).where(eq(roleSources.roleId, role.id)).orderBy(roleSources.createdAt),
    db.select().from(roleAccess).where(eq(roleAccess.roleId, role.id)),
    db.query.orgs.findFirst({ where: eq(orgs.id, c.org.id) }),
    db
      .select({ id: applications.id, name: persons.name, stage: applications.stage })
      .from(applications)
      .innerJoin(persons, eq(persons.id, applications.personId))
      .where(and(eq(applications.roleId, role.id), inArray(applications.stage, ["shortlisted", "interviewing", "offer", "hired"]))),
  ]);
  const people = new Set(access.map((a) => a.userId));
  const here = `/console/roles/${role.id}/settings`;
  const bad = saved && ["hire-missing", "reason-missing", "source-missing"].includes(saved);
  const STAGE_ORDER = ["hired", "offer", "interviewing", "shortlisted"];
  finalists.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));

  return (
    <div className="grid max-w-[46rem] gap-5">
      <div>
        <h2 className="font-display text-[17px] font-semibold">Role settings</h2>
        <p className="text-[13px] text-slate">The basics, who can see the role, where candidates come from, and closing it. You can also ask the AI to change any of this.</p>
      </div>
      {saved && SAVED[saved] ? (
        <p role={bad ? "alert" : "status"} className={`rounded-[10px] px-3 py-2 text-[13px] ${bad ? "bg-alert/[0.06] text-alert" : "bg-mist"}`}>
          {SAVED[saved]}
        </p>
      ) : null}

      <Card>
        <CardHead title="Basics" />
        <form action={saveBasics} className="grid gap-4 px-4 pb-4">
          <input type="hidden" name="roleId" value={role.id} />
          <input type="hidden" name="next" value={`${here}?saved=basics`} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title">
              <input name="title" defaultValue={role.title} className={fieldClass} />
            </Field>
            <Field label="Family" optional>
              <input name="family" defaultValue={role.family ?? ""} className={fieldClass} />
            </Field>
            <Field label="Hiring manager" optional>
              <select name="hiringManagerId" defaultValue={role.hiringManagerId ?? ""} className={fieldClass}>
                <option value="">Not set</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Locations" optional hint="Comma separated">
              <input name="locations" defaultValue={role.locations.join(", ")} className={fieldClass} />
            </Field>
            <Field label="Openings">
              <input name="openings" type="number" min={1} defaultValue={role.openings} className={fieldClass} />
            </Field>
            <Field label="Target date" optional>
              <input name="targetDate" type="date" defaultValue={role.targetDate ?? ""} className={fieldClass} />
            </Field>
            <Field label="Compensation band, from" optional hint="₹ lakh per year">
              <input name="compMin" inputMode="decimal" defaultValue={lakh(role.compMin)} className={fieldClass} />
            </Field>
            <Field label="to" optional hint="₹ lakh per year">
              <input name="compMax" inputMode="decimal" defaultValue={lakh(role.compMax)} className={fieldClass} />
            </Field>
          </div>
          <label className="flex items-center gap-2.5 text-[13.5px]">
            <input name="compShareable" type="checkbox" defaultChecked={role.compShareable} className="size-4 accent-[#1b4dff]" />
            The band can be shared with candidates
          </label>
          <div>
            <button type="submit" className={buttonClass("primary")}>
              Save
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHead title="Who can see this role" />
        <form action={saveVisibility} className="grid gap-3 px-4 pb-4">
          <input type="hidden" name="roleId" value={role.id} />
          <input type="hidden" name="next" value={`${here}?saved=visibility`} />
          <label className="flex items-center gap-2.5 text-[13.5px]">
            <input type="radio" name="visibility" value="team" defaultChecked={role.visibility === "team"} className="size-4 accent-[#1b4dff]" />
            The TA team and the hiring manager
          </label>
          <label className="flex items-center gap-2.5 text-[13.5px]">
            <input type="radio" name="visibility" value="restricted" defaultChecked={role.visibility === "restricted"} className="size-4 accent-[#1b4dff]" />
            Only the people below (admins can always see it)
          </label>
          <ul className="grid gap-1.5 pl-6 sm:grid-cols-2">
            {team.map((t) => (
              <li key={t.id}>
                <label className="flex items-center gap-2.5 text-[13.5px]">
                  <input type="checkbox" name="people" value={t.id} defaultChecked={people.has(t.id) || t.id === c.user.id || t.id === role.hiringManagerId} className="size-4 accent-[#1b4dff]" />
                  {t.name || t.email}
                </label>
              </li>
            ))}
          </ul>
          <div>
            <button type="submit" className={buttonClass("secondary")}>
              Save
            </button>
          </div>
        </form>
      </Card>

      <Card id="sources">
        <CardHead title="Sources and what they cost" meta="The cost lets Analytics compare sources by cost per shortlist and per hire." />
        <div className="grid gap-3 px-4 pb-4">
          {sources.length ? (
            <ul className="grid gap-2">
              {sources.map((s) => (
                <li key={s.id} className="flex flex-wrap items-end gap-2 rounded-[12px] border border-hairline p-3">
                  <form action={saveRoleSource} className="flex flex-1 flex-wrap items-end gap-2">
                    <input type="hidden" name="roleId" value={role.id} />
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="kind" value={s.kind} />
                    <Field label={SOURCE_LABEL[s.kind] ?? s.kind}>
                      <input name="label" defaultValue={s.label} className={`${fieldClass} sm:w-56`} />
                    </Field>
                    <Field label="Cost (₹)">
                      <input name="costInr" inputMode="numeric" defaultValue={s.costInr || ""} placeholder="0" className={`${fieldClass} sm:w-32`} />
                    </Field>
                    <button type="submit" className={buttonClass("secondary", "sm")}>
                      Save
                    </button>
                  </form>
                  <form action={deleteRoleSource}>
                    <input type="hidden" name="roleId" value={role.id} />
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className={buttonClass("ghost", "sm")} aria-label={`Remove ${s.label}`}>
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-slate">No sources with a cost yet. Uploads are free; add a job board or an agency here to track what it cost.</p>
          )}
          <form action={saveRoleSource} className="flex flex-wrap items-end gap-2 border-t border-hairline pt-3">
            <input type="hidden" name="roleId" value={role.id} />
            <Field label="Kind">
              <select name="kind" className={`${fieldClass} sm:w-40`}>
                {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name">
              <input name="label" placeholder="e.g. Naukri listing" className={`${fieldClass} sm:w-48`} />
            </Field>
            <Field label="Cost (₹)">
              <input name="costInr" inputMode="numeric" placeholder="e.g. 15000" className={`${fieldClass} sm:w-32`} />
            </Field>
            <button type="submit" className={buttonClass("secondary", "sm")}>
              Add source
            </button>
          </form>
        </div>
      </Card>

      <Card>
        <CardHead title="Who candidate questions come from" meta={`The organisation default is ${org?.questionSender === "company" ? c.org.name : "Winnow"}.`} />
        <form action={setQuestionSenderForm} className="grid gap-2 px-4 pb-4">
          <input type="hidden" name="roleId" value={role.id} />
          {(["winnow", "company"] as const).map((m) => (
            <label key={m} className="flex items-start gap-2.5 text-[13.5px]">
              <input type="radio" name="questionSender" value={m} defaultChecked={(role.questionSender ?? org?.questionSender ?? "winnow") === m} className="mt-0.5 size-4 accent-[#1b4dff]" />
              <span>
                {m === "winnow" ? "Winnow, on your behalf" : `${c.org.name}, from your domain`}
                <span className="block text-slate">{m === "winnow" ? "Replies come to Winnow and are read for you." : "Needs your email domain connected in Integrations."}</span>
              </span>
            </label>
          ))}
          <div className="mt-1">
            <button type="submit" className={buttonClass("secondary")}>
              Save
            </button>
          </div>
        </form>
      </Card>

      {role.state === "open" ? (
        <Card className="border-alert/25">
          <CardHead title="Close the role" meta="It stays readable, with its history. Nothing more is sent to candidates." />
          <form action={closeRole} className="grid gap-4 px-4 pb-4">
            <input type="hidden" name="roleId" value={role.id} />
            <fieldset className="grid gap-2">
              <legend className="text-[13px] font-medium">Why</legend>
              {[
                ["filled", "Filled"],
                ["cancelled", "Cancelled, no longer hiring"],
                ["on_hold", "On hold for now"],
              ].map(([v, l]) => (
                <label key={v} className="flex items-center gap-2.5 text-[13.5px]">
                  <input type="radio" name="reason" value={v} required className="peer size-4 accent-[#1b4dff]" />
                  {l}
                </label>
              ))}
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="text-[13px] font-medium">If filled, who was hired?</legend>
              <p className="text-[12.5px] text-slate">The most useful thing you can tell us: it checks the rubric against what actually happened.</p>
              {finalists.length ? (
                <ul className="grid gap-1.5">
                  {finalists.map((f) => (
                    <li key={f.id}>
                      <label className="flex items-center gap-2.5 text-[13.5px]">
                        <input type="checkbox" name="hired" value={f.id} defaultChecked={f.stage === "hired"} className="size-4 accent-[#1b4dff]" />
                        {f.name} <span className="text-slate">· {f.stage}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="flex items-center gap-2.5 text-[13.5px]">
                <input type="checkbox" name="unknownHire" className="size-4 accent-[#1b4dff]" />
                Someone who did not come through Winnow
              </label>
            </fieldset>
            <Field label="Anything to remember" optional>
              <input name="note" className={fieldClass} />
            </Field>
            <div>
              <button type="submit" className={buttonClass("danger")}>
                Close the role
              </button>
            </div>
          </form>
        </Card>
      ) : (
        <Card>
          <CardHead
            title={role.state === "closed" ? "This role is closed" : "This role is on hold"}
            meta={role.closeReason === "filled" ? `Filled${role.hiredApplicationId ? "" : ", by someone from outside Winnow"}.` : role.closeReason === "cancelled" ? "Cancelled." : undefined}
          />
          <form action={reopenRole} className="px-4 pb-4">
            <input type="hidden" name="roleId" value={role.id} />
            <button type="submit" className={buttonClass("secondary")}>
              Reopen
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}
