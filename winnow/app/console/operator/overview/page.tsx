import type { Metadata } from "next";
import { buildDemoCustomer, createOrg, deleteDemoCustomer, openDemoCustomer } from "@/lib/console/actions/session";
import { queueCounts, rolesPerOperator, slaView } from "@/lib/console/data/operator";
import { findDemo } from "@/lib/console/demo";
import { Badge, Card, CardHead, Field, PageHeader, Stat, buttonClass, fieldClass, tableClass, tdClass, thClass } from "@/components/console/ui";

export const metadata: Metadata = { title: "Operator" };

export default async function Overview({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const err = (await searchParams).error;
  const [q, sla, ops, demo] = await Promise.all([queueCounts(), slaView(), rolesPerOperator(), findDemo()]);
  const months = [...new Set(ops.map((o) => o.month))].sort().reverse().slice(0, 6);
  const people = [...new Map(ops.map((o) => [o.id, o.name])).entries()];
  return (
    <div className="grid gap-6">
      <PageHeader title="Across every customer" meta="Work waits by action, so twelve roles batch into one pass." />
      <div className="grid grid-cols-2 gap-5 rounded-[14px] border border-hairline p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Searches to run" value={q?.searches ?? 0} />
        <Stat label="Results to open" value={q?.triage ?? 0} />
        <Stat label="Messages to send" value={q?.outreach ?? 0} />
        <Stat label="Replies to process" value={q?.replies ?? 0} />
        <Stat label="Parse failures" value={q?.parse ?? 0} />
        <Stat label="Merges to review" value={q?.merges ?? 0} />
      </div>

      <Card>
        <CardHead title="Customers: SLA and risk" meta="First shortlist within 5 days of a role opening; nothing stalled for a week; nothing unreadable left behind." />
        <div className="overflow-x-auto px-1 pb-2">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Customer</th>
                <th className={`${thClass} text-right`}>Open roles</th>
                <th className={thClass}>No shortlist after 5 days</th>
                <th className={thClass}>Stalled</th>
                <th className={thClass}>Past target</th>
                <th className={`${thClass} text-right`}>Unreadable</th>
                <th className={`${thClass} text-right`}>Failed</th>
                <th className={thClass}>Risk</th>
              </tr>
            </thead>
            <tbody>
              {sla.map((o) => (
                <tr key={o.id}>
                  <td className={tdClass}>
                    {o.name} <span className="text-[12px] text-slate">· {o.plan}</span>
                  </td>
                  <td className={`${tdClass} text-right font-mono tabular-nums`}>{o.open}</td>
                  <td className={tdClass}>{o.noShortlist.join(", ") || "–"}</td>
                  <td className={tdClass}>{o.stalled.join(", ") || "–"}</td>
                  <td className={tdClass}>{o.late.join(", ") || "–"}</td>
                  <td className={`${tdClass} text-right font-mono tabular-nums ${o.unreadable ? "text-alert" : ""}`}>{o.unreadable}</td>
                  <td className={`${tdClass} text-right font-mono tabular-nums ${o.failed ? "text-alert" : ""}`}>{o.failed}</td>
                  <td className={tdClass}>
                    <Badge tone={o.risk === "high" ? "alert" : o.risk === "medium" ? "caution" : "ok"}>{o.risk}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHead title="Roles per operator per month" meta="Distinct roles each operator worked on. The number that decides whether this is a company or a job." />
        {ops.length === 0 ? (
          <p className="px-4 py-4 text-[13.5px] text-slate sm:px-5">No operator work recorded yet.</p>
        ) : (
          <div className="overflow-x-auto px-1 pb-2">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Operator</th>
                  {months.map((m) => (
                    <th key={m} className={`${thClass} text-right`}>
                      {new Date(`${m}-01T00:00:00+05:30`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map(([id, name]) => (
                  <tr key={id}>
                    <td className={tdClass}>{name}</td>
                    {months.map((m) => (
                      <td key={m} className={`${tdClass} text-right font-mono tabular-nums`}>
                        {ops.find((o) => o.id === id && o.month === m)?.roles ?? "–"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHead
          title="Demo customer"
          meta="A made-up company with three roles and 31 candidates already read, scored and part-way through hiring. Everyone in it is fictional, and it cannot email anyone."
        />
        <div className="flex flex-wrap items-center gap-2 px-4 py-4 sm:px-5">
          {demo ? (
            <>
              <form action={openDemoCustomer}>
                <button type="submit" className={buttonClass("primary")}>
                  Open {demo.name}
                </button>
              </form>
              <form action={buildDemoCustomer}>
                <button type="submit" className={buttonClass("secondary")}>
                  Reset it
                </button>
              </form>
              <form action={deleteDemoCustomer}>
                <button type="submit" className={buttonClass("ghost")}>
                  Delete it
                </button>
              </form>
            </>
          ) : (
            <form action={buildDemoCustomer}>
              <button type="submit" className={buttonClass("primary")}>
                Create demo customer
              </button>
            </form>
          )}
        </div>
      </Card>

      <Card>
        <CardHead title="New customer" />
        <form action={createOrg} className="grid gap-4 px-4 py-4 sm:grid-cols-3 sm:items-end sm:px-5">
          <Field label="Company name">
            <input name="name" required className={fieldClass} />
          </Field>
          <Field label="Email domain" optional>
            <input name="domain" placeholder="e.g. lumenpay.in" className={fieldClass} />
          </Field>
          <Field label="First admin's email" optional>
            <input name="adminEmail" type="email" className={fieldClass} />
          </Field>
          <div className="sm:col-span-3">
            {err === "name" ? <p className="mb-2 text-[13px] text-alert">Give the company a name.</p> : null}
            <button type="submit" className={buttonClass("primary")}>
              Create customer
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
