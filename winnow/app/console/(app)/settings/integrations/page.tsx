import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrations, orgs } from "@/lib/db/schema";
import { can, requireCtx } from "@/lib/console/context";
import { emailDomain, requestIntegration, saveSlack } from "@/lib/console/actions/settings";
import { aiConfigured } from "@/lib/ai/claude";
import { Badge, Card, CardHead, buttonClass, fieldClass } from "@/components/console/ui";
import Saved from "@/components/console/Saved";

export const metadata: Metadata = { title: "Integrations" };

type Rec = { record?: string; name?: string; type?: string; value?: string; status?: string; priority?: number };

function Block({ title, status, reads, writes, stops, children }: { title: string; status: React.ReactNode; reads: string; writes: string; stops: string; children?: React.ReactNode }) {
  return (
    <Card>
      <CardHead title={title} action={status} />
      <div className="grid gap-3 px-4 py-4 text-[13.5px] sm:px-5">
        <dl className="grid gap-1.5 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <dt className="text-slate">Reads</dt>
          <dd>{reads}</dd>
          <dt className="text-slate">Writes</dt>
          <dd>{writes}</dd>
          <dt className="text-slate">If disconnected</dt>
          <dd>{stops}</dd>
        </dl>
        {children}
      </div>
    </Card>
  );
}

export default async function Integrations({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const c = await requireCtx();
  const saved = (await searchParams).saved;
  const admin = can.integrations(c);
  const [rows, org] = await Promise.all([db.select().from(integrations).where(eq(integrations.orgId, c.org.id)), db.query.orgs.findFirst({ where: eq(orgs.id, c.org.id) })]);
  const get = (k: string) => rows.find((r) => r.kind === k);
  const domain = get("email_domain");
  const records = ((domain?.config?.records as Rec[] | undefined) ?? []).filter((r) => r.name && r.value);
  const on = <Badge tone="ok">Connected</Badge>;
  const off = <Badge tone="muted">Not connected</Badge>;

  return (
    <div className="grid gap-5">
      <Saved
        code={saved}
        messages={{
          "slack-on": "Slack is connected. A test message was posted.",
          "slack-off": "Slack is disconnected.",
          "bad-slack": "That is not a Slack incoming webhook URL (it starts https://hooks.slack.com/services/).",
          "domain-added": "Domain added. Publish the DNS records below, then check.",
          "domain-on": "Your sending domain is verified.",
          "domain-pending": "Not verified yet. DNS can take a few hours to update; check again later.",
          "domain-off": "Sending domain disconnected.",
          "domain-error": "The domain could not be added. See the error below.",
          "bad-domain": "That does not look like a domain.",
          "no-resend": "Email sending is not set up on this deployment yet (RESEND_API_KEY).",
          requested: "Requested. Winnow's team will contact you to set it up.",
        }}
        problems={["bad-slack", "domain-error", "bad-domain", "no-resend", "domain-pending"]}
      />
      {!admin ? <p className="text-[13px] text-slate">Only an admin connects or disconnects integrations.</p> : null}

      <Block
        title="Email sending domain"
        status={domain?.status === "connected" ? on : domain?.config?.pending ? <Badge tone="caution">Waiting for DNS</Badge> : off}
        reads="Nothing."
        writes={`Questions and interview invites go out from ${domain?.config?.sendingDomain ? String(domain.config.sendingDomain) : "your own domain"}, so candidates see your name.`}
        stops="Emails go out from Winnow's address on your behalf instead. Nothing is lost."
      >
        {domain?.status === "error" ? <p className="text-alert">{String(domain.config.error ?? "Error")}</p> : null}
        {records.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="text-slate">
                  <th className="py-1 pr-3 font-medium">Type</th>
                  <th className="py-1 pr-3 font-medium">Name</th>
                  <th className="py-1 pr-3 font-medium">Value</th>
                  <th className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {records.map((r, i) => (
                  <tr key={i} className="border-t border-hairline align-top">
                    <td className="py-1.5 pr-3">{r.type}</td>
                    <td className="py-1.5 pr-3 break-all">{r.name}</td>
                    <td className="max-w-[22rem] py-1.5 pr-3 break-all">{r.value}</td>
                    <td className="py-1.5 font-sans">{r.status ?? "pending"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {admin ? (
          domain?.config?.resendId ? (
            <div className="flex flex-wrap gap-2">
              {domain.status !== "connected" ? (
                <form action={emailDomain}>
                  <input type="hidden" name="op" value="verify" />
                  <button type="submit" className={buttonClass("primary", "sm")}>
                    Check DNS
                  </button>
                </form>
              ) : null}
              <form action={emailDomain}>
                <input type="hidden" name="op" value="disconnect" />
                <button type="submit" className={buttonClass("ghost", "sm")}>
                  Disconnect
                </button>
              </form>
            </div>
          ) : (
            <form action={emailDomain} className="flex flex-wrap gap-2">
              <input type="hidden" name="op" value="add" />
              <input name="domain" defaultValue={org?.domain ?? ""} placeholder="yourcompany.com" aria-label="Your domain" className={`${fieldClass} h-9 sm:w-64`} />
              <button type="submit" className={buttonClass("secondary", "sm")}>
                Add domain
              </button>
            </form>
          )
        ) : null}
      </Block>

      <Block
        title="Slack"
        status={org?.slackWebhook ? on : off}
        reads="Nothing."
        writes="Posts the notifications people choose to receive in Slack to one channel."
        stops="Those notifications still arrive in the console and by email."
      >
        {admin ? (
          <form action={saveSlack} className="flex flex-wrap gap-2">
            <input name="webhook" required placeholder={org?.slackWebhook ? "Connected. Paste a new URL to replace it" : "Incoming webhook URL"} aria-label="Slack webhook URL" className={`${fieldClass} h-9 sm:w-96`} />
            <button type="submit" className={buttonClass("secondary", "sm")}>
              {org?.slackWebhook ? "Replace" : "Connect"}
            </button>
          </form>
        ) : null}
        {admin && org?.slackWebhook ? (
          <form action={saveSlack}>
            <input type="hidden" name="webhook" value="" />
            <button type="submit" className={buttonClass("ghost", "sm")}>
              Disconnect
            </button>
          </form>
        ) : null}
      </Block>

      {(["ats", "calendar"] as const).map((k) => {
        const row = get(k);
        const requested = Boolean(row?.config?.requested);
        return (
          <Block
            key={k}
            title={k === "ats" ? "Applicant tracking system" : "Calendar"}
            status={row?.status === "connected" ? on : requested ? <Badge tone="caution">Requested</Badge> : off}
            reads={k === "ats" ? "Jobs, applications and CVs, and the decisions recorded there." : "Interviewers' free and busy times, never event details."}
            writes={k === "ats" ? "Winnow's shortlist and reasons back onto each application, if you want them." : "Interview events, directly on the interviewer's calendar."}
            stops={k === "ats" ? "Upload CVs or forward an inbox instead; everything already imported stays." : "Interviews still go out as calendar invites that work with Google, Outlook and Apple calendars."}
          >
            {admin && row?.status !== "connected" ? (
              requested ? (
                <p className="text-slate">Requested{row?.config?.provider ? ` for ${String(row.config.provider)}` : ""}. Winnow&rsquo;s team sets this up with you.</p>
              ) : (
                <form action={requestIntegration} className="flex flex-wrap gap-2">
                  <input type="hidden" name="kind" value={k} />
                  <input name="provider" placeholder={k === "ats" ? "Which one (e.g. Zoho Recruit, Greenhouse)" : "Google Workspace or Microsoft 365"} aria-label="Which one" className={`${fieldClass} h-9 sm:w-80`} />
                  <button type="submit" className={buttonClass("secondary", "sm")}>
                    Request connection
                  </button>
                </form>
              )
            ) : null}
          </Block>
        );
      })}

      <Block
        title="Claude"
        status={aiConfigured() ? on : <Badge tone="alert">Not set up</Badge>}
        reads="The CVs, job descriptions and answers it is asked to read, with personal attributes removed before scoring."
        writes="Rubrics, verdicts, reasons and suggested questions, always shown to you before anything is sent."
        stops="Nothing is read or scored. Everything already scored stays."
      />
    </div>
  );
}
