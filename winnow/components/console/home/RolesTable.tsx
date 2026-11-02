"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/console/ui";

export type RoleRow = {
  id: string;
  title: string;
  manager: string | null;
  mine: boolean;
  daysOpen: number;
  received: number;
  toReview: number;
  shortlisted: number;
  interviewing: number;
  offer: number;
  failed: number;
  failReason: string | null;
  unreadable: number;
  status: string;
  tone: "alert" | "caution" | "signal" | "muted";
  risk: "high" | "medium" | "low";
};

const RISK = { high: 2, medium: 1, low: 0 };
const say = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The pipeline, left to right, as one bar per role. Colour deepens as people move on. */
const STEPS = [
  { key: "toReview", label: "to review", cls: "bg-slate/35" },
  { key: "shortlisted", label: "shortlisted", cls: "bg-signal/45" },
  { key: "interviewing", label: "interviewing", cls: "bg-signal" },
  { key: "offer", label: "offer", cls: "bg-ok" },
] as const;

function Pipeline({ r }: { r: RoleRow }) {
  const total = Math.max(r.received, 1);
  const parts = STEPS.map((s) => ({ ...s, n: r[s.key] })).filter((s) => s.n > 0);
  const words = [`${r.received} candidate${r.received === 1 ? "" : "s"}`, ...parts.map((s) => `${s.n} ${s.label}`)].join(" · ");
  return (
    <div className="min-w-0">
      <div role="img" aria-label={words} title={words} className="flex h-1.5 w-full max-w-[22rem] gap-[2px] overflow-hidden rounded-full bg-ink/[0.06]">
        {parts.map((s) => (
          <span key={s.key} className={`h-full ${s.cls}`} style={{ width: `${Math.max(3, (s.n / total) * 100)}%` }} />
        ))}
      </div>
      <p className="mt-1.5 truncate text-[12px] tabular-nums text-slate">
        <span className="font-medium text-ink">{r.received}</span> candidates
        {parts.map((s) => (
          <span key={s.key}>
            {" · "}
            <span className={s.key === "toReview" ? "font-medium text-ink" : ""}>{s.n}</span> {s.label}
          </span>
        ))}
      </p>
    </div>
  );
}

/** One row per role: how many candidates are at each step, and a status in words. Riskiest first. */
export default function RolesTable({ rows }: { rows: RoleRow[] }) {
  const [mine, setMine] = useState(false);
  const [closed, setClosed] = useState(false);
  const shown = useMemo(
    () =>
      rows
        .filter((r) => (!mine || r.mine) && (closed || r.status !== "closed"))
        .sort((a, b) => RISK[b.risk] - RISK[a.risk] || (a.status === "stalled" ? -1 : 0) || b.daysOpen - a.daysOpen),
    [rows, mine, closed],
  );
  const anyClosed = rows.some((r) => r.status === "closed");
    const problems = (r: RoleRow) =>
    [r.failed ? `${r.failed} could not be scored` : "", r.unreadable ? `${r.unreadable} could not be read` : ""].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <button type="button" onClick={() => setMine(!mine)} aria-pressed={mine} className={`h-7 rounded-[6px] border px-2.5 text-[12.5px] ${mine ? "border-ink/15 bg-ink/[0.06] font-medium text-ink" : "border-hairline text-slate hover:bg-mist hover:text-ink"}`}>
          Only mine
        </button>
        {anyClosed ? (
          <button type="button" onClick={() => setClosed(!closed)} aria-pressed={closed} className={`h-7 rounded-[6px] border px-2.5 text-[12.5px] ${closed ? "border-ink/15 bg-ink/[0.06] font-medium text-ink" : "border-hairline text-slate hover:bg-mist hover:text-ink"}`}>
            Include closed
          </button>
        ) : null}
        <a href="/api/console/export?what=roles" className="ml-auto text-slate hover:text-ink">
          Download
        </a>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-[8px] border border-hairline px-4 py-4 text-[13px] text-slate">{mine ? "No roles where you are the hiring manager or the creator." : "No open roles."}</p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[8px] border border-hairline md:block">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="bg-mist/60 text-[12px] text-slate">
                <tr>
                  <th className="h-8 px-4 font-medium">Role</th>
                  <th className="h-8 px-4 font-medium">
                    <span className="flex items-center gap-3">
                      Pipeline
                      <span className="flex items-center gap-2.5 font-normal" aria-hidden="true">
                        {STEPS.map((x) => (
                          <span key={x.key} className="inline-flex items-center gap-1">
                            <span className={`size-1.5 rounded-full ${x.cls}`} />
                            {x.label}
                          </span>
                        ))}
                      </span>
                    </span>
                  </th>
                  <th className="h-8 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="group border-t border-hairline hover:bg-mist/40">
                    <td className="w-[34%] px-4 py-3 align-top">
                      <Link href={`/console/roles/${r.id}`} className="font-medium group-hover:underline">
                        {r.title}
                      </Link>
                      <span className="mt-0.5 block text-[12px] text-slate">
                        {r.manager ?? "No hiring manager"} · {r.status === "closed" ? "closed" : `open ${r.daysOpen} day${r.daysOpen === 1 ? "" : "s"}`}
                      </span>
                      {problems(r) ? (
                        <span className="block text-[12px] text-alert" title={r.failReason ?? undefined}>
                          {problems(r)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="pt-1.5">
                        <Pipeline r={r} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">
                      <Badge tone={r.tone}>{say(r.status)}</Badge>
                      {r.risk === "high" ? <span className="mt-1 block text-[12px] text-alert">Behind target</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-2 md:hidden">
            {shown.map((r) => (
              <li key={r.id}>
                <Link href={`/console/roles/${r.id}`} className="block rounded-[8px] border border-hairline p-3">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium">{r.title}</span>
                    <Badge tone={r.tone}>{say(r.status)}</Badge>
                  </span>
                  <div className="mt-2.5">
                    <Pipeline r={r} />
                  </div>
                  {problems(r) ? <span className="mt-1 block text-[12px] text-alert">{problems(r)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
