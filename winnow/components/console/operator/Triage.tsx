"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { draftOutreach, markOpened, moveCut } from "@/lib/console/actions/operator";
import { Button, Card, CardHead } from "@/components/console/ui";

type R = { id: string; name: string; headline: string | null; url: string | null; snippet: string | null; score: number | null; aboveCut: boolean; opened: boolean };
type G = { searchId: string; query: string; target: string; role: string; org: string; results: R[] };

export default function Triage({ groups }: { groups: G[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ?? null) : (r.error ?? "Something went wrong."));
      router.refresh();
    });
  return (
    <div className="grid gap-5">
      {msg ? (
        <p role="status" className="rounded-[10px] bg-mist px-3 py-2 text-[13px]">
          {msg}
        </p>
      ) : null}
      {groups.map((g) => {
        const above = g.results.filter((r) => r.aboveCut).length;
        return (
          <Card key={g.searchId}>
            <CardHead
              title={`${g.org} · ${g.role}`}
              meta={`${g.target} · ${g.results.length} results · ${above} above the line`}
              action={
                <Button size="sm" tone="primary" disabled={pending || above === 0} onClick={() => run(() => draftOutreach(g.searchId))}>
                  Draft messages for {above}
                </Button>
              }
            />
            <ol>
              {g.results.map((r, i) => {
                const line = r.aboveCut && !g.results[i + 1]?.aboveCut && i < g.results.length - 1;
                return (
                  <li key={r.id} className={`border-b border-hairline last:border-0 ${line ? "border-b-2 border-b-signal" : ""} ${r.aboveCut ? "" : "bg-mist/50"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px]">
                          <span className="font-mono text-[12px] tabular-nums text-slate">{Math.round((r.score ?? 0) * 100)}%</span>{" "}
                          {r.url ? (
                            <a href={r.url} target="_blank" rel="noreferrer noopener" onClick={() => markOpened(r.id)} className={`font-medium hover:underline ${r.opened ? "text-slate" : ""}`}>
                              {r.name}
                            </a>
                          ) : (
                            <span className="font-medium">{r.name}</span>
                          )}
                          {r.headline ? <span className="text-slate"> · {r.headline}</span> : null}
                        </p>
                        {r.snippet ? <p className="truncate text-[12.5px] text-slate">{r.snippet}</p> : null}
                      </div>
                      <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(() => moveCut(g.searchId, r.id))} aria-label={`Move the cut line to ${r.name}`}>
                        Cut here
                      </Button>
                    </div>
                    {line ? <p className="px-4 pb-1 text-[11.5px] font-medium text-signal sm:px-5">Cut line: open everything above</p> : null}
                  </li>
                );
              })}
            </ol>
          </Card>
        );
      })}
    </div>
  );
}
