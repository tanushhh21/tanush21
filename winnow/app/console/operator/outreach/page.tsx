import type { Metadata } from "next";
import { outreachQueue } from "@/lib/console/data/operator";
import { outreachDiscard, outreachSent, saveOutreach } from "@/lib/console/actions/operator";
import { Card, Empty, PageHeader, areaClass, buttonClass } from "@/components/console/ui";
import Flash from "@/components/console/operator/Flash";

export const metadata: Metadata = { title: "Outreach" };

export default async function Outreach({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const saved = (await searchParams).saved;
  const rows = await outreachQueue("drafted");
  return (
    <div className="grid gap-5">
      <PageHeader title="Messages awaiting a human send" meta="Drafted from the triage. Edit, send it yourself on the platform, then record it here." />
      <Flash text={saved} />
      {rows.length === 0 ? <Empty title="Nothing to send">Draft messages from the results above the cut line in Triage.</Empty> : null}
      {rows.map(({ o, role, org, url, headline }) => (
        <Card key={o.id}>
          <form action={saveOutreach} className="grid gap-2 px-4 py-4 sm:px-5">
            <input type="hidden" name="id" value={o.id} />
            <p className="text-[12.5px] text-slate">
              {org} · {role} · {o.channel}
            </p>
            <p className="text-[14px]">
              To{" "}
              {url ? (
                <a href={url} target="_blank" rel="noreferrer noopener" className="font-medium hover:underline">
                  {o.toName}
                </a>
              ) : (
                <span className="font-medium">{o.toName}</span>
              )}
              {headline ? <span className="text-slate"> · {headline}</span> : null}
            </p>
            <textarea name="draft" aria-label={`Message to ${o.toName}`} defaultValue={o.draft} className={`${areaClass} min-h-24`} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" formAction={outreachSent} className={buttonClass("primary", "sm")}>
                I sent it
              </button>
              <button type="submit" className={buttonClass("secondary", "sm")}>
                Save draft
              </button>
              <button type="submit" formAction={outreachDiscard} className={buttonClass("ghost", "sm")}>
                Discard
              </button>
            </div>
          </form>
        </Card>
      ))}
    </div>
  );
}
