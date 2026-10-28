"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, smallFieldClass } from "@/components/console/ui";

export type RoleRow = {
  id: string;
  title: string;
  manager: string | null;
  mine: boolean;
  daysOpen: number;
  received: number;
  scored: number;
  failed: number;
  failReason: string | null;
  unreadable: number;
  shortlisted: number;
  stages: { label: string; n: number }[];
  status: string;
  tone: "alert" | "caution" | "signal" | "muted";
  risk: "high" | "medium" | "low";
};

const RISK = { high: 2, medium: 1, low: 0 };
const STAGE_RANK = [
  "sourcing",
  "screening",
  "waiting on you",
  "waiting on the manager",
  "interviewing",
  "offer out",
  "stalled",
  "closed",
];

/** One row per role with a computed status word; sortable, filterable to just mine. */
export default function RolesTable({ rows }: { rows: RoleRow[] }) {
  const [sort, setSort] = useState<"risk" | "days" | "stage">("risk");
  const [mine, setMine] = useState(false);
  const [closed, setClosed] = useState(false);
  const shown = useMemo(() => {
    const list = rows.filter(
      (r) => (!mine || r.mine) && (closed || r.status !== "closed"),
    );
    return list.sort((a, b) =>
      sort === "days"
        ? b.daysOpen - a.daysOpen
        : sort === "stage"
          ? STAGE_RANK.indexOf(b.status) - STAGE_RANK.indexOf(a.status)
          : RISK[b.risk] - RISK[a.risk] ||
            (a.status === "stalled" ? -1 : 0) ||
            b.daysOpen - a.daysOpen,
    );
  }, [rows, sort, mine, closed]);
  const anyClosed = rows.some((r) => r.status === "closed");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px]">
        <label className="flex items-center gap-2">
          <span className="text-slate">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className={smallFieldClass}
          >
            <option value="risk">By risk</option>
            <option value="days">By days open</option>
            <option value="stage">By stage</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => setMine(e.target.checked)}
            className="size-4 accent-[#1b4dff]"
          />
          Just mine
        </label>
        {anyClosed ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={closed}
              onChange={(e) => setClosed(e.target.checked)}
              className="size-4 accent-[#1b4dff]"
            />
            Show closed
          </label>
        ) : null}
        <a
          href="/api/console/export?what=roles"
          className="ml-auto text-slate hover:text-ink"
        >
          Export CSV
        </a>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-[14px] border border-hairline px-4 py-5 text-[14px] text-slate">
          {mine
            ? "No roles where you are the hiring manager or the creator."
            : "No open roles."}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="text-[12px] text-slate">
                  <th className="border-b border-hairline py-2 pr-3 font-medium">
                    Role
                  </th>
                  <th className="border-b border-hairline px-3 py-2 text-right font-medium">
                    Open
                  </th>
                  <th className="border-b border-hairline px-3 py-2 text-right font-medium">
                    Received
                  </th>
                  <th className="border-b border-hairline px-3 py-2 text-right font-medium">
                    Scored
                  </th>
                  <th className="border-b border-hairline px-3 py-2 text-right font-medium">
                    Shortlisted
                  </th>
                  <th className="border-b border-hairline px-3 py-2 font-medium">
                    Stages
                  </th>
                  <th className="border-b border-hairline py-2 pl-3 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="group">
                    <td className="border-b border-hairline py-2.5 pr-3">
                      <Link
                        href={`/console/roles/${r.id}`}
                        className="font-medium group-hover:underline"
                      >
                        {r.title}
                      </Link>
                      <span className="block text-[12px] text-slate">
                        {r.manager ?? "No hiring manager"}
                      </span>
                    </td>
                    <td className="border-b border-hairline px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums">
                      {r.daysOpen}d
                    </td>
                    <td className="border-b border-hairline px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums">
                      {r.received}
                    </td>
                    <td className="border-b border-hairline px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums">
                      {r.scored}
                      {r.failed ? (
                        <span
                          className="block font-sans text-[11.5px] text-alert"
                          title={r.failReason ?? undefined}
                        >
                          {r.failed} failed
                        </span>
                      ) : null}
                      {r.unreadable ? (
                        <span className="block font-sans text-[11.5px] text-alert">
                          {r.unreadable} unreadable
                        </span>
                      ) : null}
                    </td>
                    <td className="border-b border-hairline px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums">
                      {r.shortlisted}
                    </td>
                    <td className="border-b border-hairline px-3 py-2.5">
                      <Stages stages={r.stages} />
                    </td>
                    <td className="whitespace-nowrap border-b border-hairline py-2.5 pl-3">
                      <Badge tone={r.tone}>{r.status}</Badge>
                      {r.risk === "high" ? (
                        <span className="ml-1.5 text-[11.5px] text-alert">
                          at risk
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-2 md:hidden">
            {shown.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/console/roles/${r.id}`}
                  className="block rounded-[14px] border border-hairline p-3.5"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium">{r.title}</span>
                    <Badge tone={r.tone}>{r.status}</Badge>
                  </span>
                  <span className="mt-1 block font-mono text-[12px] tabular-nums text-slate">
                    {r.daysOpen}d open · {r.received} received · {r.scored}{" "}
                    scored · {r.shortlisted} shortlisted
                  </span>
                  {r.failed || r.unreadable ? (
                    <span className="mt-1 block text-[12px] text-alert">
                      {[
                        r.failed ? `${r.failed} failed to score` : "",
                        r.unreadable ? `${r.unreadable} unreadable` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                  <span className="mt-2 block">
                    <Stages stages={r.stages} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Stage distribution as one quiet stacked bar, with the counts beside it. */
function Stages({ stages }: { stages: { label: string; n: number }[] }) {
  const total = stages.reduce((n, s) => n + s.n, 0);
  if (!total)
    return <span className="text-[12px] text-slate">No candidates yet</span>;
  const shades = [
    "bg-signal/25",
    "bg-signal/45",
    "bg-signal/65",
    "bg-signal/85",
    "bg-signal",
  ];
  return (
    <span
      className="flex min-w-36 items-center gap-2"
      aria-label={stages.map((s) => `${s.label} ${s.n}`).join(", ")}
      title={stages.map((s) => `${s.label} ${s.n}`).join(" · ")}
    >
      <span className="flex h-2 w-28 gap-[2px] overflow-hidden rounded-full">
        {stages.map((s, i) =>
          s.n ? (
            <span
              key={s.label}
              className={`h-full ${shades[Math.min(i, shades.length - 1)]}`}
              style={{ width: `${(100 * s.n) / total}%` }}
            />
          ) : null,
        )}
      </span>
      <span className="truncate text-[11.5px] text-slate">
        {stages
          .filter((s) => s.n)
          .map((s) => `${s.n} ${s.label}`)
          .slice(-2)
          .join(", ")}
      </span>
    </span>
  );
}
