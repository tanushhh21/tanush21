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
  const num = (n: number, strong = false) => <span className={`tabular-nums ${n ? (strong ? "font-semibold text-ink" : "text-ink") : "text-slate/60"}`}>{n}</span>;
  const problems = (r: RoleRow) =>
    [r.failed ? `${r.failed} could not be scored` : "", r.unreadable ? `${r.unreadable} could not be read` : ""].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <button type="button" onClick={() => setMine(!mine)} aria-pressed={mine} className={`rounded-full px-3 py-1.5 ${mine ? "bg-ink text-paper" : "bg-mist text-slate hover:text-ink"}`}>
          Only mine
        </button>
        {anyClosed ? (
          <button type="button" onClick={() => setClosed(!closed)} aria-pressed={closed} className={`rounded-full px-3 py-1.5 ${closed ? "bg-ink text-paper" : "bg-mist text-slate hover:text-ink"}`}>
            Include closed
          </button>
        ) : null}
        <a href="/api/console/export?what=roles" className="ml-auto text-slate hover:text-ink">
          Download
        </a>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-[14px] border border-hairline px-4 py-5 text-[14px] text-slate">{mine ? "No roles where you are the hiring manager or the creator." : "No open roles."}</p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[14px] border border-hairline md:block">
            <table className="w-full border-collapse text-left text-[13.5px]">
              <thead className="bg-mist/60 text-[12px] text-slate">
                <tr>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 text-right font-medium">Candidates</th>
                  <th className="px-3 py-2 text-right font-medium">To review</th>
                  <th className="px-3 py-2 text-right font-medium">Shortlisted</th>
                  <th className="px-3 py-2 text-right font-medium">Interviewing</th>
                  <th className="px-3 py-2 text-right font-medium">Offer</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="group border-t border-hairline hover:bg-mist/40">
                    <td className="px-4 py-3">
                      <Link href={`/console/roles/${r.id}`} className="font-medium group-hover:underline">
                        {r.title}
                      </Link>
                      <span className="block text-[12px] text-slate">
                        {r.manager ?? "No hiring manager"} · {r.status === "closed" ? "closed" : `open ${r.daysOpen} day${r.daysOpen === 1 ? "" : "s"}`}
                      </span>
                      {problems(r) ? (
                        <span className="block text-[12px] text-alert" title={r.failReason ?? undefined}>
                          {problems(r)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right">{num(r.received)}</td>
                    <td className="px-3 py-3 text-right">{num(r.toReview, true)}</td>
                    <td className="px-3 py-3 text-right">{num(r.shortlisted)}</td>
                    <td className="px-3 py-3 text-right">{num(r.interviewing)}</td>
                    <td className="px-3 py-3 text-right">{num(r.offer)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge tone={r.tone}>{say(r.status)}</Badge>
                      {r.risk === "high" ? <span className="ml-1.5 text-[12px] text-alert">behind target</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-2 md:hidden">
            {shown.map((r) => (
              <li key={r.id}>
                <Link href={`/console/roles/${r.id}`} className="block rounded-[14px] border border-hairline p-3.5">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium">{r.title}</span>
                    <Badge tone={r.tone}>{say(r.status)}</Badge>
                  </span>
                  <span className="mt-1 block text-[12.5px] text-slate">
                    {r.received} candidates · <span className="font-medium text-ink">{r.toReview} to review</span> · {r.shortlisted} shortlisted
                    {r.interviewing ? ` · ${r.interviewing} interviewing` : ""}
                    {r.offer ? ` · ${r.offer} offer` : ""}
                  </span>
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
