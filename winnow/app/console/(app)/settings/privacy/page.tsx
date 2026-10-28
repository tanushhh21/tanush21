import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgs, rightsRequests, users } from "@/lib/db/schema";
import { can, requireCtx } from "@/lib/console/context";
import { deleteCandidate, logRightsRequest, resolveRightsRequest, saveRetention } from "@/lib/console/actions/settings";
import { RETENTION_KINDS } from "@/lib/console/privacy";
import { Badge, Card, CardHead, Field, buttonClass, fieldClass, smallFieldClass } from "@/components/console/ui";
import Saved from "@/components/console/Saved";

export const metadata: Metadata = { title: "Data and privacy" };

const KIND = { access: "Access to their data", correction: "Correction", erasure: "Erasure", withdraw_consent: "Withdraw consent", grievance: "Grievance" } as const;

export default async function Privacy({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const c = await requireCtx();
  const saved = (await searchParams).saved;
  const admin = can.dataSettings(c);
  const org = (await db.query.orgs.findFirst({ where: eq(orgs.id, c.org.id) }))!;
  const requests = admin
    ? await db.select({ r: rightsRequests, by: users.name }).from(rightsRequests).leftJoin(users, eq(users.id, rightsRequests.handledBy)).where(eq(rightsRequests.orgId, c.org.id)).orderBy(desc(rightsRequests.receivedAt)).limit(200)
    : [];
  if (!admin) return <p className="text-[13.5px] text-slate">Only an admin manages data and privacy settings.</p>;
  return (
    <div className="grid gap-5">
      <Saved
        code={saved}
        messages={{
          saved: "Saved.",
          logged: "Request logged. Resolve it below; the DPDP Act expects a timely answer.",
          resolved: "Resolved and recorded.",
          deleted: "Deleted, with everything about them. The audit log records only that it happened.",
          confirm: "Type DELETE to confirm.",
          "no-person": "Nobody with that email in your records.",
          missing: "Fill in who asked and what for.",
          "resolution-missing": "Say how it was resolved.",
        }}
        problems={["confirm", "no-person", "missing", "resolution-missing"]}
      />

      <Card>
        <CardHead title="How long records are kept" meta="Deleted automatically after this many days. People you hired are kept as long as they work with you." />
        <form action={saveRetention} className="grid gap-4 px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {RETENTION_KINDS.map((k) => (
              <Field key={k.key} label={k.label} hint={`Days. Default ${k.def}.`}>
                <input name={k.key} type="number" min={30} max={3650} defaultValue={org.retention[k.key] ?? k.def} className={fieldClass} />
              </Field>
            ))}
          </div>
          <label className="flex items-start gap-2.5 text-[13.5px]">
            <input type="checkbox" name="share" defaultChecked={org.shareWithWinnow} className="mt-0.5 size-4 accent-[#1b4dff]" />
            <span>
              Let anonymised outcomes improve Winnow for everyone
              <span className="block text-slate">
                Off by default. Your candidates, CVs, notes and decisions are held for {org.name} alone either way. When on, only counts with no names or text (which requirements predicted a hire) leave your organisation.
              </span>
            </span>
          </label>
          <div>
            <button type="submit" className={buttonClass("primary")}>
              Save
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHead title="Export everything" meta="Every role, candidate, decision and note, as one file." />
        <div className="px-4 py-4 sm:px-5">
          <a href="/api/console/export?what=everything" className={buttonClass("secondary")}>
            Download (JSON)
          </a>
        </div>
      </Card>

      <Card>
        <CardHead title="Rights requests" meta="Access, correction, erasure, withdrawal of consent and grievances, with how each was resolved." />
        <form action={logRightsRequest} className="flex flex-wrap items-end gap-3 border-b border-hairline px-4 py-4 sm:px-5">
          <Field label="Who asked">
            <input name="requester" required placeholder="Name <email>" className={`${fieldClass} sm:w-72`} />
          </Field>
          <Field label="For">
            <select name="kind" className={`${fieldClass} sm:w-52`}>
              {Object.entries(KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className={buttonClass("secondary")}>
            Log request
          </button>
        </form>
        {requests.length === 0 ? (
          <p className="px-4 py-4 text-[13.5px] text-slate sm:px-5">None yet.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {requests.map(({ r, by }) => (
              <li key={r.id} className="grid gap-2 px-4 py-3 text-[13.5px] sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{r.requester}</span> <span className="text-slate">· {KIND[r.kind]} · received {r.receivedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </span>
                  <Badge tone={r.status === "open" ? "caution" : r.status === "done" ? "ok" : "muted"}>{r.status === "open" ? "Open" : r.status === "done" ? "Done" : "Refused"}</Badge>
                </div>
                {r.status === "open" ? (
                  <form action={resolveRightsRequest} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="resolution" required placeholder="How it was resolved" aria-label="Resolution" className={`${smallFieldClass} h-9 flex-1`} />
                    <select name="status" aria-label="Outcome" className={`${smallFieldClass} h-9`}>
                      <option value="done">{r.kind === "erasure" ? "Done (deletes their records)" : r.kind === "withdraw_consent" ? "Done (stops all contact)" : "Done"}</option>
                      <option value="refused">Refused</option>
                    </select>
                    <button type="submit" className={buttonClass("secondary", "sm")}>
                      Resolve
                    </button>
                  </form>
                ) : (
                  <p className="text-slate">
                    {r.resolution} {by ? `· ${by}` : ""} {r.resolvedAt ? `· ${r.resolvedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-alert/25">
        <CardHead title="Delete a candidate" meta="Removes the person, their CVs, applications, messages and notes. Cannot be undone." />
        <form action={deleteCandidate} className="flex flex-wrap items-end gap-3 px-4 py-4 sm:px-5">
          <Field label="Their email">
            <input name="email" type="email" required className={`${fieldClass} sm:w-64`} />
          </Field>
          <Field label="Type DELETE">
            <input name="confirm" required autoComplete="off" className={`${fieldClass} sm:w-32`} />
          </Field>
          <button type="submit" className={buttonClass("danger")}>
            Delete
          </button>
        </form>
      </Card>
    </div>
  );
}
