import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { roles } from "@/lib/db/schema";
import { requireCtx, visibleRoles } from "@/lib/console/context";
import { AUDIT_KINDS, auditActors, describe, loadAudit, parseAudit } from "@/lib/console/data/audit";
import { Empty, PageHeader, buttonClass, smallFieldClass } from "@/components/console/ui";

export const metadata: Metadata = { title: "Audit" };

type Detail = { stage?: string; reasonCode?: string; note?: string | null; evaluation?: { score?: number | null; rank?: number | null; band?: string | null; confidence?: number | null; reason?: (string | null)[] } | null; [k: string]: unknown };

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const c = await requireCtx();
  const sp = await searchParams;
  const f = parseAudit(sp);
  const [rows, actors, roleList] = await Promise.all([loadAudit(c, f), auditActors(c), db.select({ id: roles.id, title: roles.title }).from(roles).where(visibleRoles(c)).orderBy(roles.title)]);
  const keep = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "before") as [string, string][]);
  const when = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Audit"
        meta="Every decision, with the evaluation as it stood at that moment and the rubric version it was made against. Every rubric change and every data access. It cannot be edited or deleted."
        actions={
          <a href={`/api/console/export?what=audit&${keep.toString()}`} className={buttonClass("ghost", "sm")}>
            Export CSV
          </a>
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-2 text-[13px]">
        <label>
          <span className="block text-[12px] text-slate">Show</span>
          <select name="kind" defaultValue={f.kind} className={smallFieldClass}>
            {Object.entries(AUDIT_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-[12px] text-slate">Role</span>
          <select name="role" defaultValue={f.roleId ?? ""} className={smallFieldClass}>
            <option value="">Any role</option>
            {roleList.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-[12px] text-slate">Who</span>
          <select name="actor" defaultValue={f.actorId ?? ""} className={smallFieldClass}>
            <option value="">Anyone</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-[12px] text-slate">Candidate</span>
          <input name="q" defaultValue={f.q} placeholder="Name" className={`${smallFieldClass} w-36`} />
        </label>
        <label>
          <span className="block text-[12px] text-slate">From</span>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={smallFieldClass} />
        </label>
        <label>
          <span className="block text-[12px] text-slate">To</span>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={smallFieldClass} />
        </label>
        <button type="submit" className={buttonClass("secondary", "sm")}>
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <Empty title="Nothing matches">Loosen a filter.</Empty>
      ) : (
        <ol className="divide-y divide-hairline overflow-hidden rounded-[14px] border border-hairline">
          {rows.map((r) => {
            const d = r.detail as Detail;
            return (
              <li key={r.id} className="grid gap-1 px-4 py-3 text-[13.5px] sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
                <time dateTime={r.at.toISOString()} className="font-mono text-[12px] tabular-nums text-slate">
                  {when(r.at)}
                </time>
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">{r.actor ?? r.actorEmail ?? "Winnow"}</span> {describe(r.action).toLowerCase()}{" "}
                    {r.candidate && r.applicationId ? (
                      <Link href={`/console/c/${r.applicationId}`} className="font-medium hover:underline">
                        {r.candidate}
                      </Link>
                    ) : null}
                    {r.role ? <span className="text-slate"> on {r.role}</span> : null}
                    {r.version ? <span className="text-slate"> · rubric v{r.version}</span> : null}
                  </p>
                  {d.reasonCode || d.stage || d.evaluation ? (
                    <p className="mt-0.5 text-[12.5px] text-slate">
                      {[
                        d.reasonCode ? `Reason: ${d.reasonCode.replace(/_/g, " ")}` : "",
                        d.stage ? `at ${d.stage}` : "",
                        d.evaluation ? `Evaluation then: score ${d.evaluation.score ?? "–"}, rank ${d.evaluation.rank ?? "–"}, ${String(d.evaluation.band ?? "").replace(/_/g, " ")}` : "",
                        d.note ? `Note: ${d.note}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {d.evaluation?.reason?.filter(Boolean).length ? <p className="text-[12.5px] text-slate">Why, then: {d.evaluation.reason.filter(Boolean).join(" / ")}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {rows.length === 100 ? (
        <div>
          <Link href={`/console/audit?${new URLSearchParams([...keep.entries(), ["before", rows[rows.length - 1].at.toISOString()]])}`} className={buttonClass("secondary", "sm")}>
            Older
          </Link>
        </div>
      ) : null}
    </div>
  );
}
