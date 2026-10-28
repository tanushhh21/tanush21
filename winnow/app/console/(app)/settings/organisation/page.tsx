import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgs } from "@/lib/db/schema";
import { can, requireCtx } from "@/lib/console/context";
import { saveOrg } from "@/lib/console/actions/settings";
import { Field, areaClass, buttonClass, fieldClass } from "@/components/console/ui";
import Saved from "@/components/console/Saved";

export const metadata: Metadata = { title: "Organisation" };

export default async function Organisation({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const c = await requireCtx();
  const saved = (await searchParams).saved;
  const org = (await db.query.orgs.findFirst({ where: eq(orgs.id, c.org.id) }))!;
  const admin = can.orgSettings(c);
  const bands = org.compBands.map((b) => `${b.level}: ${Math.round(b.min / 10000) / 10}-${Math.round(b.max / 10000) / 10}`).join("\n");
  return (
    <>
      <Saved code={saved} messages={{ saved: "Saved.", "bad-email": "That careers email does not look right.", "bad-logo": "The logo must be an https:// link to an image." }} problems={["bad-email", "bad-logo"]} />
      {!admin ? <p className="mb-4 text-[13px] text-slate">Only an admin can change these.</p> : null}
      <form action={saveOrg} className="grid gap-5">
        <fieldset disabled={!admin} className="grid gap-5 sm:grid-cols-2">
          <Field label="Name">
            <input name="name" defaultValue={org.name} className={fieldClass} />
          </Field>
          <Field label="Website domain" optional>
            <input name="domain" defaultValue={org.domain ?? ""} placeholder="e.g. lumenpay.in" className={fieldClass} />
          </Field>
          <Field label="Careers email" optional hint="Replies to questions go here when they come from your company.">
            <input name="careersEmail" type="email" defaultValue={org.careersEmail ?? ""} placeholder="careers@…" className={fieldClass} />
          </Field>
          <Field label="Logo" optional hint="An https:// link to a square image.">
            <input name="logoUrl" defaultValue={org.logoUrl ?? ""} className={fieldClass} />
          </Field>
          <Field label="Locations" optional hint="Comma separated">
            <input name="locations" defaultValue={org.locations.join(", ")} placeholder="Bengaluru, Remote" className={fieldClass} />
          </Field>
          <Field label="Flag a candidate waiting at a stage after" hint="Days. Shows in needs-you.">
            <input name="staleDays" type="number" min={1} max={60} defaultValue={org.staleDays} className={fieldClass} />
          </Field>
          <Field label="Level ladder" optional hint="One level per line, lowest first, in your own words.">
            <textarea name="levelLadder" defaultValue={org.levelLadder.join("\n")} placeholder={"SDE I\nSDE II\nSenior SDE\nStaff"} className={areaClass} />
          </Field>
          <Field label="Compensation bands by level" optional hint="One per line, in ₹ lakh a year: “SDE II: 18-26”.">
            <textarea name="compBands" defaultValue={bands} placeholder={"SDE I: 10-16\nSDE II: 18-26"} className={areaClass} />
          </Field>
          <Field label="Candidate questions come from">
            <select name="questionSender" defaultValue={org.questionSender} className={fieldClass}>
              <option value="winnow">Winnow, on your behalf</option>
              <option value="company">{org.name}, with replies to your careers email</option>
            </select>
          </Field>
        </fieldset>
        {admin ? (
          <div>
            <button type="submit" className={buttonClass("primary")}>
              Save
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}
