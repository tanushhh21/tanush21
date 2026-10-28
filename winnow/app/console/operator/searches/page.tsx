import type { Metadata } from "next";
import { searchesToRun } from "@/lib/console/data/operator";
import { addResults, markSearch } from "@/lib/console/actions/operator";
import { Badge, Card, CardHead, Empty, PageHeader, areaClass, buttonClass } from "@/components/console/ui";
import Flash from "@/components/console/operator/Flash";

export const metadata: Metadata = { title: "Searches" };

export default async function Searches({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const saved = (await searchParams).saved;
  const all = await searchesToRun();
  const byTarget = new Map<string, typeof all>();
  for (const s of all) byTarget.set(s.target, [...(byTarget.get(s.target) ?? []), s]);
  return (
    <div className="grid gap-5">
      <PageHeader title="Boolean searches to run" meta="Grouped by where they run, across every customer. Run each, paste what came back, and the ranker draws a cut line." />
      <Flash text={saved} />
      {all.length === 0 ? <Empty title="No searches waiting">They appear when a customer asks Winnow to source a role.</Empty> : null}
      {[...byTarget.entries()].map(([target, list]) => (
        <Card key={target}>
          <CardHead title={target} meta={`${list.filter((s) => s.status === "to_run").length} to run`} />
          <ul className="divide-y divide-hairline">
            {list.map((s) => (
              <li key={s.id} className="grid gap-2 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-slate">
                  <span>
                    {s.org} · {s.role} · {s.group}
                  </span>
                  {s.status === "run" ? <Badge tone="ok">Run · {s.results} results</Badge> : <Badge tone="caution">To run</Badge>}
                </div>
                <code className="block whitespace-pre-wrap break-words rounded-[8px] bg-mist px-3 py-2 font-mono text-[12.5px]">{s.query}</code>
                <div className="flex flex-wrap gap-2">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer noopener" className={buttonClass("secondary", "sm")}>
                      Open in {target}
                    </a>
                  ) : null}
                  {s.status === "to_run" ? (
                    <form action={markSearch}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="status" value="skipped" />
                      <button type="submit" className={buttonClass("ghost", "sm")}>
                        Skip
                      </button>
                    </form>
                  ) : null}
                </div>
                <details>
                  <summary className="cursor-pointer text-[13px] text-slate hover:text-ink">Paste results</summary>
                  <form action={addResults} className="mt-2 grid gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <textarea name="results" required placeholder={"One per line: Name | headline | profile URL | snippet\nAarav Shah | Backend Engineer at Razorpay | https://… | Go, PostgreSQL, Kafka"} className={`${areaClass} font-mono text-[12.5px]`} />
                    <div>
                      <button type="submit" className={buttonClass("primary", "sm")}>
                        Add and rank
                      </button>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
