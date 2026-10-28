import type { Metadata } from "next";
import { mergesToReview } from "@/lib/console/data/operator";
import { resolveMerge } from "@/lib/console/actions/operator";
import { Card, CardHead, Empty, PageHeader, buttonClass } from "@/components/console/ui";
import Flash from "@/components/console/operator/Flash";

export const metadata: Metadata = { title: "Merges" };

type P = { id: string; name: string; email: string | null; phone: string | null; city: string | null; links: string[]; apps: string[] };

function Person({ p }: { p: P }) {
  return (
    <div className="min-w-0 rounded-[12px] border border-hairline p-3 text-[13px]">
      <p className="font-medium">{p.name}</p>
      <dl className="mt-1 grid grid-cols-[4rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-slate">
        <dt>Email</dt>
        <dd className="truncate text-ink">{p.email ?? "–"}</dd>
        <dt>Phone</dt>
        <dd className="text-ink">{p.phone ?? "–"}</dd>
        <dt>City</dt>
        <dd className="text-ink">{p.city ?? "–"}</dd>
        <dt>Links</dt>
        <dd className="truncate text-ink">{p.links.join(", ") || "–"}</dd>
        <dt>Applied</dt>
        <dd className="text-ink">{p.apps.join("; ") || "–"}</dd>
      </dl>
    </div>
  );
}

export default async function Merges({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const saved = (await searchParams).saved;
  const rows = await mergesToReview();
  return (
    <div className="grid gap-5">
      <PageHeader title="Is this the same person?" meta="Low-confidence matches from the person graph, lowest confidence first. Merging moves everything onto the first record." />
      <Flash text={saved} />
      {rows.length === 0 ? <Empty title="Nothing to review">Every match so far was confident.</Empty> : null}
      {rows.map((m) => (
        <Card key={m.id}>
          <CardHead title={`${m.org}: ${Math.round(m.confidence * 100)}% likely the same`} meta={m.reason} />
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
            <Person p={m.a!} />
            <Person p={m.b!} />
          </div>
          <form action={resolveMerge} className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5">
            <input type="hidden" name="id" value={m.id} />
            <button type="submit" name="op" value="merge" className={buttonClass("primary", "sm")}>
              Same person: merge
            </button>
            <button type="submit" name="op" value="distinct" className={buttonClass("secondary", "sm")}>
              Different people
            </button>
          </form>
        </Card>
      ))}
    </div>
  );
}
