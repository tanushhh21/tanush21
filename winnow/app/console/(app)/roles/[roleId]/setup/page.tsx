import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { assertCan, can, requireCtx, requireRole } from "@/lib/console/context";
import { markRubricReviewed, saveBasics, saveSources, saveVisibility } from "@/lib/console/actions/roles";
import { teamFor } from "@/lib/console/team";
import { loadRubric } from "@/lib/console/data/rubric";
import { Field, PageHeader, buttonClass, fieldClass } from "@/components/console/ui";
import Steps from "@/components/console/roles/Steps";
import RubricList from "@/components/console/roles/RubricList";
import Uploader from "@/components/console/roles/Uploader";
import Waiter from "@/components/console/roles/Waiter";

export const metadata: Metadata = { title: "Set up the role" };

const lakh = (n: number | null) => (n == null ? "" : String(Math.round((n / 100000) * 10) / 10));

export default async function Setup({ params, searchParams }: { params: Promise<{ roleId: string }>; searchParams: Promise<{ step?: string }> }) {
  const c = await requireCtx();
  assertCan(c, can.editRoleSettings);
  const role = await requireRole(c, (await params).roleId);
  const step = Math.min(5, Math.max(2, Number((await searchParams).step) || 2));
  const next = (n: number) => `/console/roles/${role.id}/setup?step=${n}`;
  const skip = (n: number) => (
    <Link href={n > 5 ? `/console/roles/${role.id}` : next(n)} className={buttonClass("ghost")}>
      Skip
    </Link>
  );

  return (
    <div className="mx-auto max-w-[46rem]">
      <PageHeader title={role.title} eyebrow="New role" meta="Then it runs, and the workspace opens with progress as it goes." />
      <Steps current={step} roleId={role.id} />
      <div className="mt-8">
        {step === 2 ? <Basics /> : step === 3 ? <RubricStep /> : step === 4 ? <Sources /> : <Visibility />}
      </div>
    </div>
  );

  async function Basics() {
    const team = await teamFor(c.org.id);
    return (
      <form action={saveBasics} className="grid gap-5">
        <input type="hidden" name="roleId" value={role.id} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Title">
            <input name="title" defaultValue={role.title === "New role" ? "" : role.title} placeholder="Named from the description if left blank" className={fieldClass} />
          </Field>
          <Field label="Family" optional>
            <input name="family" defaultValue={role.family ?? ""} placeholder="e.g. Engineering" className={fieldClass} />
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
          <Field label="Locations" optional hint="Comma separated, e.g. Bengaluru, Remote">
            <input name="locations" defaultValue={role.locations.join(", ")} className={fieldClass} />
          </Field>
          <Field label="Openings">
            <input name="openings" type="number" min={1} defaultValue={role.openings} className={fieldClass} />
          </Field>
          <Field label="Target date" optional>
            <input name="targetDate" type="date" defaultValue={role.targetDate ?? ""} className={fieldClass} />
          </Field>
          <Field label="Compensation band, from" optional hint="₹ lakh per year">
            <input name="compMin" inputMode="decimal" defaultValue={lakh(role.compMin)} placeholder="e.g. 18" className={fieldClass} />
          </Field>
          <Field label="to" optional hint="₹ lakh per year">
            <input name="compMax" inputMode="decimal" defaultValue={lakh(role.compMax)} placeholder="e.g. 26" className={fieldClass} />
          </Field>
        </div>
        <label className="flex items-center gap-2.5 text-[13.5px]">
          <input name="compShareable" type="checkbox" defaultChecked={role.compShareable} className="size-4 accent-[#1b4dff]" />
          The band can be shared with candidates
        </label>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass("primary")}>
            Continue
          </button>
          {skip(3)}
        </div>
      </form>
    );
  }

  async function RubricStep() {
    const rubric = role.rubricVersion > 0 ? await loadRubric(role.id, role.rubricVersion) : null;
    const failed = !rubric
      ? await db.query.jobs.findFirst({ where: and(eq(jobs.roleId, role.id), eq(jobs.kind, "rubric"), eq(jobs.status, "failed")) })
      : null;
    return (
      <div className="grid gap-6">
        {rubric ? (
          <>
            <p className="text-[13.5px] text-slate">
              What Winnow will screen on. Nothing here is approved yet; it is shown so you can catch anything wrong. You can change it any time, and changes
              re-score everyone.
            </p>
            <RubricList rubric={rubric} />
          </>
        ) : failed ? (
          <p className="rounded-[12px] bg-alert/[0.06] px-4 py-3 text-[13.5px] text-alert">The rubric could not be built: {failed.error}</p>
        ) : (
          <div className="rounded-[12px] border border-hairline px-4 py-6 text-center">
            <p className="font-medium">Building the rubric…</p>
            <p className="mt-1 text-[13px] text-slate">You can continue; it keeps building in the background.</p>
            <Waiter roleId={role.id} until="rubric" />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href={next(4)} className={buttonClass("primary")}>
            Continue
          </Link>
          {rubric ? (
            <form action={markRubricReviewed}>
              <input type="hidden" name="roleId" value={role.id} />
              <input type="hidden" name="next" value={`/console/roles/${role.id}/rubric`} />
              <button type="submit" className={buttonClass("secondary")}>
                Edit the rubric
              </button>
            </form>
          ) : null}
        </div>
      </div>
    );
  }

  async function Sources() {
    const picked = new Set(role.sources);
    return (
      <div className="grid gap-6">
        <section>
          <h2 className="font-display text-[15px] font-semibold">Upload CVs</h2>
          <p className="mt-0.5 text-[13px] text-slate">A folder of applications, or a few files. Winnow reads and ranks them as they arrive.</p>
          <div className="mt-3">
            <Uploader roleId={role.id} />
          </div>
        </section>
        <section>
          <h2 className="font-display text-[15px] font-semibold">Add a referral</h2>
          <div className="mt-3">
            <Uploader roleId={role.id} source="referral" />
          </div>
        </section>
        <form action={saveSources} className="grid gap-3">
          <input type="hidden" name="roleId" value={role.id} />
          <h2 className="font-display text-[15px] font-semibold">More sources</h2>
          <label className="flex items-start gap-2.5 rounded-[12px] border border-hairline p-3.5 text-[13.5px]">
            <input type="checkbox" name="sources" value="winnow_sourcing" defaultChecked={picked.has("winnow_sourcing")} className="mt-0.5 size-4 accent-[#1b4dff]" />
            <span>
              <span className="font-medium">Ask Winnow to source</span>
              <span className="block text-slate">We search beyond your applicants, including people who have not applied.</span>
            </span>
          </label>
          <div className="flex items-start gap-2.5 rounded-[12px] border border-hairline p-3.5 text-[13.5px]">
            <span className="mt-0.5 size-4 rounded-[4px] border border-hairline" aria-hidden="true" />
            <span>
              <span className="font-medium">Connect your ATS</span>
              <span className="block text-slate">
                {can.integrations(c) ? (
                  <Link href="/console/settings/integrations" className="text-signal hover:underline">
                    Set up in Integrations
                  </Link>
                ) : (
                  "An admin connects it in Settings."
                )}
              </span>
            </span>
          </div>
          <div className="flex items-start gap-2.5 rounded-[12px] border border-hairline p-3.5 text-[13.5px]">
            <span className="mt-0.5 size-4 rounded-[4px] border border-hairline" aria-hidden="true" />
            <span>
              <span className="font-medium">Forward a careers inbox</span>
              <span className="block text-slate">Available once your email domain is connected in Integrations.</span>
            </span>
          </div>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary")}>
              Continue
            </button>
            {skip(5)}
          </div>
        </form>
      </div>
    );
  }

  async function Visibility() {
    const team = await teamFor(c.org.id);
    return (
      <form action={saveVisibility} className="grid gap-5">
        <input type="hidden" name="roleId" value={role.id} />
        <fieldset className="grid gap-2.5">
          <legend className="text-[13px] font-medium">Who can see this role</legend>
          <label className="flex items-start gap-2.5 rounded-[12px] border border-hairline p-3.5 text-[13.5px]">
            <input type="radio" name="visibility" value="team" defaultChecked={role.visibility === "team"} className="mt-0.5 size-4 accent-[#1b4dff]" />
            <span>
              <span className="font-medium">The TA team and the hiring manager</span>
              <span className="block text-slate">The default.</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 rounded-[12px] border border-hairline p-3.5 text-[13.5px]">
            <input type="radio" name="visibility" value="restricted" defaultChecked={role.visibility === "restricted"} className="mt-0.5 size-4 accent-[#1b4dff]" />
            <span>
              <span className="font-medium">Only the people I choose</span>
              <span className="block text-slate">For confidential roles. Admins can always see it.</span>
            </span>
          </label>
        </fieldset>
        <fieldset>
          <legend className="text-[13px] font-medium">People</legend>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {team.map((t) => (
              <li key={t.id}>
                <label className="flex items-center gap-2.5 text-[13.5px]">
                  <input type="checkbox" name="people" value={t.id} defaultChecked={t.id === c.user.id || t.id === role.hiringManagerId} className="size-4 accent-[#1b4dff]" />
                  {t.name || t.email}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass("primary")}>
            Open the workspace
          </button>
        </div>
      </form>
    );
  }
}
