import type { Metadata } from "next";
import { outreachQueue, sentOutreach } from "@/lib/console/data/operator";
import { recordReply, replyInterested, replyLater, replyNo } from "@/lib/console/actions/operator";
import { Card, CardHead, Empty, Field, PageHeader, areaClass, buttonClass, fieldClass } from "@/components/console/ui";
import Flash from "@/components/console/operator/Flash";

export const metadata: Metadata = { title: "Replies" };

export default async function Replies({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const saved = (await searchParams).saved;
  const [replied, sent] = await Promise.all([outreachQueue("replied"), sentOutreach()]);
  return (
    <div className="grid gap-5">
      <PageHeader title="Replies to process" meta="An interested person becomes a candidate on the role, read and scored like anyone else." />
      <Flash text={saved} />
      {replied.length === 0 ? <Empty title="No replies waiting">Record a reply against a sent message below.</Empty> : null}
      {replied.map(({ o, role, org }) => (
        <Card key={o.id}>
          <CardHead title={`${o.toName} replied`} meta={`${org} · ${role} · ${o.channel}`} />
          <div className="grid gap-3 px-4 py-4 sm:px-5">
            <blockquote className="whitespace-pre-wrap rounded-[10px] bg-mist px-3 py-2 text-[13.5px]">{o.reply}</blockquote>
            <form action={replyInterested} className="grid gap-2">
              <input type="hidden" name="id" value={o.id} />
              <Field label="Their CV or profile, pasted" hint="Needed to add them: Winnow reads and scores it against the role.">
                <textarea name="profile" className={`${areaClass} min-h-24`} />
              </Field>
              <Field label="Email" optional>
                <input name="email" type="email" className={`${fieldClass} sm:w-72`} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button type="submit" formAction={replyInterested} className={buttonClass("primary", "sm")}>
                  Interested: add to the role
                </button>
                <button type="submit" formAction={replyLater} className={buttonClass("secondary", "sm")}>
                  Later
                </button>
                <button type="submit" formAction={replyNo} className={buttonClass("ghost", "sm")}>
                  Not interested
                </button>
              </div>
            </form>
          </div>
        </Card>
      ))}
      {sent.length ? (
        <Card>
          <CardHead title="Sent, waiting for a reply" />
          <ul className="divide-y divide-hairline">
            {sent.map(({ o, role, org }) => (
              <li key={o.id} className="px-4 py-3 sm:px-5">
                <details>
                  <summary className="cursor-pointer text-[13.5px]">
                    <span className="font-medium">{o.toName}</span> <span className="text-slate">· {org} · {role} · sent {o.sentAt?.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  </summary>
                  <form action={recordReply} className="mt-2 grid gap-2">
                    <input type="hidden" name="id" value={o.id} />
                    <textarea name="reply" required aria-label={`Reply from ${o.toName}`} placeholder="Paste their reply" className={`${areaClass} min-h-16`} />
                    <div>
                      <button type="submit" className={buttonClass("secondary", "sm")}>
                        Record reply
                      </button>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
