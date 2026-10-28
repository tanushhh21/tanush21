import type { Metadata } from "next";
import { triage } from "@/lib/console/data/operator";
import { Empty, PageHeader } from "@/components/console/ui";
import Flash from "@/components/console/operator/Flash";
import Triage from "@/components/console/operator/Triage";

export const metadata: Metadata = { title: "Triage" };

export default async function TriagePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const saved = (await searchParams).saved;
  const groups = await triage();
  return (
    <div className="grid gap-5">
      <PageHeader title="Which previews to open" meta="Ranked against each role's rubric. Above the line: open it. Move the line where your judgement says, and the ranker learns the threshold for that role." />
      <Flash text={saved} />
      {groups.length === 0 ? (
        <Empty title="Nothing to triage">Paste results into a search and they land here, ranked.</Empty>
      ) : (
        <Triage groups={groups.map((g) => ({ ...g, results: g.results.map((r) => ({ id: r.id, name: r.name, headline: r.headline, url: r.url, snippet: r.snippet, score: r.score, aboveCut: r.aboveCut, opened: r.opened })) }))} />
      )}
    </div>
  );
}
