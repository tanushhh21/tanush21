"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Row } from "@/lib/console/data/ranking";
import type { Reason } from "@/lib/console/data/ranking";
import type { Candidate } from "@/lib/console/data/candidate";
import type { Band, VerdictValue, ViewConfig } from "@/lib/db/schema";
import { addToPool, decide, fetchCandidate, saveView } from "@/lib/console/actions/candidates";
import { askQuestions } from "@/lib/console/actions/questions";
import { Badge, Button, Kbd, areaClass, buttonClass, fieldClass, smallFieldClass } from "@/components/console/ui";
import CandidateView from "@/components/console/candidate/CandidateView";
import { BandBadge, DecisionBadge, Evidence, VerdictMark } from "@/components/console/candidate/bits";
import {
  BAND_LABEL,
  DEFAULT_COLUMNS,
  FACT_LABEL,
  META_COLUMNS,
  SOURCE_LABEL,
  VERDICT_LABEL,
  cellText,
  columnLabel,
  describeFilter,
  download,
  matches,
  sortRows,
  toCsv,
  type Filter,
  type Req,
  type Sort,
} from "./model";

type View = { id: string; name: string; config: ViewConfig; mine: boolean };

type Props = {
  scope: "ranking" | "candidates";
  roleId: string;
  roleTitle: string;
  requirements: Req[];
  rows: Row[];
  reasons: Reason[];
  views: View[];
  canAsk: boolean;
  initialFilters?: Filter[];
  busy: boolean;
};

type Dialog =
  | { kind: "decide"; ids: string[]; decision: "shortlisted" | "dropped" | "held" }
  | { kind: "ask"; ids: string[] }
  | { kind: "pool"; ids: string[] }
  | { kind: "save" }
  | { kind: "help" }
  | null;

const STATUS_LABEL: Record<Row["status"], string> = { reading: "Reading", waiting: "Waiting for the rubric", scoring: "Scoring", failed: "Scoring failed", unreadable: "Unreadable", done: "" };

export default function Ranking(p: Props) {
  const router = useRouter();
  const defaultCols = p.scope === "ranking" ? DEFAULT_COLUMNS : ["name", "decision", "reason_code", "decided_by", "applied", "stage_days", "score", "band", "source"];
  const [columns, setColumns] = useState<string[]>(defaultCols);
  const [filters, setFilters] = useState<Filter[]>(p.initialFilters ?? []);
  const [sort, setSort] = useState<Sort>({ key: p.scope === "ranking" ? "rank" : "applied", dir: p.scope === "ranking" ? "asc" : "desc" });
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState<string[]>([]);
  const [focus, setFocus] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Candidate | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<null | "columns" | "filters" | "views">(null);
  const [showBelow, setShowBelow] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [hideDropped, setHideDropped] = useState(p.scope === "ranking");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ parsing: number; scoring: number; rubric: number; received: number; parsed: number; unreadable: number; scored: number; busy: boolean } | null>(null);

  // ---- Derived lists ----------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return p.rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !(r.strength ?? "").toLowerCase().includes(q) && !Object.values(r.facts).some((f) => f.v.toLowerCase().includes(q))) return false;
      return filters.every((f) => matches(r, f, p.requirements));
    });
  }, [p.rows, p.requirements, filters, search]);

  const groups = useMemo(() => {
    const sorted = sortRows(filtered, sort);
    if (p.scope === "candidates") return { main: sorted, below: [], removed: [], pending: [], broken: [], droppedHidden: 0 };
    // Dropped people (duplicates included) step out of the way unless asked for.
    const shown = hideDropped ? sorted.filter((r) => r.decision !== "dropped") : sorted;
    const pend = shown.filter((r) => r.status === "reading" || r.status === "waiting" || r.status === "scoring");
    const broken = shown.filter((r) => r.status === "unreadable" || r.status === "failed");
    const done = shown.filter((r) => r.status === "done");
    return {
      main: done.filter((r) => !r.filteredOut && r.band !== "below_bar"),
      below: done.filter((r) => !r.filteredOut && r.band === "below_bar"),
      removed: done.filter((r) => r.filteredOut),
      pending: pend,
      broken,
      droppedHidden: sorted.length - shown.length,
    };
  }, [filtered, sort, p.scope, hideDropped]);

  /** The rows keyboard navigation moves through, in on-screen order. */
  const nav = useMemo(() => [...groups.main, ...(showBelow ? groups.below : []), ...(showRemoved ? groups.removed : [])], [groups, showBelow, showRemoved]);
  const focused = nav[Math.min(focus, nav.length - 1)];

  const bandCounts = useMemo(() => {
    const done = p.rows.filter((r) => r.status === "done");
    return {
      verified: done.filter((r) => r.band === "verified").length,
      needs_verification: done.filter((r) => r.band === "needs_verification").length,
      below_bar: done.filter((r) => r.band === "below_bar").length,
      contradictions: p.rows.filter((r) => r.contradictions > 0).length,
    };
  }, [p.rows]);

  // ---- Progress, while anything is being read or scored ----------------------------
  useEffect(() => {
    if (!p.busy) return;
    let stop = false;
    let refreshes = 0;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await fetch(`/api/console/roles/${p.roleId}/progress`, { cache: "no-store" });
        const j = await r.json();
        setProgress(j);
        refreshes++;
        if (!j.busy) {
          router.refresh();
          return;
        }
        if (refreshes % 3 === 0) router.refresh();
      } catch {}
      setTimeout(tick, 2500);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [p.busy, p.roleId, router]);

  // ---- Panel -------------------------------------------------------------------------
  const open = useCallback(
    (id: string) => {
      setOpenId(id);
      setPanel(null);
      window.history.replaceState(null, "", `?c=${id}`);
      fetchCandidate(id).then((d) => setPanel(d));
    },
    [setOpenId],
  );
  const close = useCallback(() => {
    setOpenId(null);
    setPanel(null);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c && p.rows.some((r) => r.id === c)) open(c);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = () => {
    router.refresh();
    if (openId) fetchCandidate(openId).then((d) => setPanel(d));
  };

  // ---- Keyboard: j/k move, Enter opens, p shortlists, x drops, a asks, c compares, / searches, ? helps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (dialog) {
        if (e.key === "Escape") setDialog(null);
        return;
      }
      const id = focused?.id;
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setFocus((f) => Math.min(nav.length - 1, f + 1));
          if (openId && nav[focus + 1]) open(nav[focus + 1].id);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          setFocus((f) => Math.max(0, f - 1));
          if (openId && nav[focus - 1]) open(nav[focus - 1].id);
          break;
        case "Enter":
          if (id) open(id);
          break;
        case "Escape":
          if (openId) close();
          else if (menu) setMenu(null);
          break;
        case "p":
          if (id) setDialog({ kind: "decide", ids: [id], decision: "shortlisted" });
          break;
        case "x":
          if (id) setDialog({ kind: "decide", ids: [id], decision: "dropped" });
          break;
        case "a":
          if (id && p.canAsk) setDialog({ kind: "ask", ids: [id] });
          break;
        case "c":
          if (id) toggleCompare(id);
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "?":
          setDialog({ kind: "help" });
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    document.querySelector(`[data-row="${focused?.id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focused?.id]);

  const toggleCompare = (id: string) =>
    setCompare((c) => {
      if (c.includes(id)) return c.filter((x) => x !== id);
      if (c.length >= 5) {
        setToast("Compare takes up to five.");
        return c;
      }
      return [...c, id];
    });

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const applyView = (config: ViewConfig) => {
    setColumns(config.columns ?? defaultCols);
    setFilters((config.filters as Filter[]) ?? []);
    setSort(config.sort ?? { key: "rank", dir: "asc" });
    setDensity(config.density ?? "comfortable");
    setMenu(null);
  };

  const exportCsv = (rows: Row[]) => {
    const all = [...new Set(["rank", "name", ...columns.filter((c) => c !== "rank" && c !== "name")])];
    download(`${p.roleTitle.replace(/[^\w]+/g, "-").toLowerCase()}-${p.scope}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, all, p.requirements));
  };

  const neighbours = useMemo(() => {
    if (!openId) return [];
    const i = nav.findIndex((r) => r.id === openId);
    return [nav[i - 1], nav[i + 1], nav[i - 2], nav[i + 2]].filter(Boolean).map((r) => ({ id: r!.id, name: r!.name, rank: r!.rank }));
  }, [openId, nav]);

  const pad = density === "compact" ? "py-1.5" : "py-2.5";

  // ---- Render --------------------------------------------------------------------------
  return (
    <div className="grid gap-4">
      {p.scope === "ranking" ? (
        <div className="flex flex-wrap gap-2" aria-label="Bands">
          {(["verified", "needs_verification", "below_bar"] as Band[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => {
                if (b === "below_bar") setShowBelow(true);
                setFilters((f) => (f.some((x) => x.t === "band") ? f.filter((x) => x.t !== "band") : [...f, { t: "band", values: [b] }]));
              }}
              className={`rounded-[10px] border px-3 py-2 text-left transition-colors hover:border-slate/40 ${filters.some((f) => f.t === "band" && f.values.includes(b)) ? "border-ink" : "border-hairline"}`}
            >
              <span className="block font-mono text-[18px] font-medium tabular-nums leading-none">{bandCounts[b]}</span>
              <span className="mt-1 block text-[12px] text-slate">{BAND_LABEL[b]}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilters((f) => (f.some((x) => x.t === "flag") ? f.filter((x) => x.t !== "flag") : [...f, { t: "flag", value: "contradiction" }]))}
            className={`rounded-[10px] border px-3 py-2 text-left transition-colors hover:border-slate/40 ${filters.some((f) => f.t === "flag") ? "border-ink" : "border-hairline"}`}
          >
            <span className="block font-mono text-[18px] font-medium tabular-nums leading-none">{bandCounts.contradictions}</span>
            <span className="mt-1 block text-[12px] text-slate">Contradictions flagged</span>
          </button>
        </div>
      ) : null}

      {progress?.busy || (p.busy && !progress) ? (
        <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] bg-signal/[0.06] px-3 py-2 text-[13px] text-ink">
          <span className="size-2 animate-pulse rounded-full bg-signal" aria-hidden="true" />
          {progress ? (
            <>
              {progress.rubric ? <span>Building the rubric</span> : null}
              {progress.parsing ? <span>Reading {progress.parsing} of {progress.received}</span> : null}
              {progress.scoring ? <span>Scoring {progress.scoring}</span> : null}
              <span className="text-slate">
                {progress.scored} scored · {progress.unreadable} unreadable
              </span>
            </>
          ) : (
            <span>Working…</span>
          )}
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[13px] tabular-nums text-slate">{filtered.length} candidates</span>
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search  /"
          aria-label="Search candidates"
          className={`${smallFieldClass} w-40 sm:w-52`}
        />
        <div className="relative">
          <Button size="sm" onClick={() => setMenu(menu === "filters" ? null : "filters")} aria-expanded={menu === "filters"}>
            Filters{filters.length ? ` (${filters.length})` : ""}
          </Button>
          {menu === "filters" ? <FilterMenu reqs={p.requirements} onAdd={(f) => setFilters([...filters, f])} onClose={() => setMenu(null)} /> : null}
        </div>
        <div className="relative">
          <Button size="sm" onClick={() => setMenu(menu === "columns" ? null : "columns")} aria-expanded={menu === "columns"}>
            Columns
          </Button>
          {menu === "columns" ? (
            <ColumnMenu reqs={p.requirements} columns={columns} onChange={setColumns} onClose={() => setMenu(null)} />
          ) : null}
        </div>
        <select aria-label="Sort" value={`${sort.key}:${sort.dir}`} onChange={(e) => {
            const v = e.target.value;
            const at = v.lastIndexOf(":");
            setSort({ key: v.slice(0, at), dir: v.slice(at + 1) as "asc" | "desc" });
          }} className={smallFieldClass}>
          <option value="rank:asc">By rank</option>
          <option value="score:desc">By score</option>
          <option value="confidence:desc">By confidence</option>
          <option value="name:asc">By name</option>
          <option value="applied:desc">Newest first</option>
          <option value="stage_days:desc">Longest at stage</option>
          <option value="fact:expected_ctc:asc">Expected CTC, low first</option>
          <option value="fact:notice_period_days:asc">Notice period, short first</option>
          {p.requirements.map((r) => (
            <option key={r.key} value={`req:${r.key}:desc`}>
              By: {r.text.slice(0, 40)}
            </option>
          ))}
        </select>
        <Button size="sm" tone="ghost" onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}>
          {density === "compact" ? "Comfortable" : "Compact"}
        </Button>
        <div className="relative">
          <Button size="sm" tone="ghost" onClick={() => setMenu(menu === "views" ? null : "views")} aria-expanded={menu === "views"}>
            Views
          </Button>
          {menu === "views" ? (
            <div className="absolute left-0 top-9 z-30 w-64 rounded-[12px] border border-hairline bg-paper p-1.5 shadow-lift-hover">
              <button type="button" className="block w-full rounded-[8px] px-2.5 py-1.5 text-left hover:bg-mist" onClick={() => applyView({})}>
                Default view
              </button>
              {p.views.map((v) => (
                <button key={v.id} type="button" className="block w-full rounded-[8px] px-2.5 py-1.5 text-left hover:bg-mist" onClick={() => applyView(v.config)}>
                  {v.name}
                  {!v.mine ? <span className="text-slate"> · shared</span> : null}
                </button>
              ))}
              <button type="button" className="mt-1 block w-full rounded-[8px] border-t border-hairline px-2.5 py-1.5 text-left text-signal hover:bg-mist" onClick={() => setDialog({ kind: "save" })}>
                Save this view…
              </button>
            </div>
          ) : null}
        </div>
        <Button size="sm" tone="ghost" onClick={() => exportCsv(filtered)}>
          Export
        </Button>
        {compare.length >= 2 ? (
          <Link href={`/console/roles/${p.roleId}/compare?ids=${compare.join(",")}`} className={buttonClass("primary", "sm")}>
            Compare {compare.length}
          </Link>
        ) : compare.length ? (
          <span className="text-[12.5px] text-slate">{compare.length} to compare · add one more</span>
        ) : null}
        <button type="button" onClick={() => setDialog({ kind: "help" })} className="ml-auto hidden text-[12.5px] text-slate hover:text-ink sm:block">
          Keyboard <Kbd>?</Kbd>
        </button>
      </div>

      {filters.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f, i) => (
            <button key={i} type="button" onClick={() => setFilters(filters.filter((_, j) => j !== i))} className="inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 text-[12.5px] hover:bg-hairline" aria-label={`Remove filter: ${describeFilter(f, p.requirements)}`}>
              {describeFilter(f, p.requirements)} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" onClick={() => setFilters([])} className="text-[12.5px] text-slate hover:text-ink">
            Clear
          </button>
        </div>
      ) : null}

      {/* Bulk actions */}
      {selected.size ? (
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-[12px] border border-hairline bg-paper/95 px-3 py-2 shadow-lift backdrop-blur lg:top-2">
          <span className="text-[13px] font-medium">{selected.size} selected</span>
          <Button size="sm" tone="primary" onClick={() => setDialog({ kind: "decide", ids: [...selected], decision: "shortlisted" })}>
            Shortlist
          </Button>
          <Button size="sm" onClick={() => setDialog({ kind: "decide", ids: [...selected], decision: "dropped" })}>
            Drop with one reason
          </Button>
          {p.canAsk ? (
            <Button size="sm" onClick={() => setDialog({ kind: "ask", ids: [...selected] })}>
              Send the same question
            </Button>
          ) : null}
          <Button size="sm" onClick={() => exportCsv(p.rows.filter((r) => selected.has(r.id)))}>
            Export
          </Button>
          <Button size="sm" onClick={() => setDialog({ kind: "pool", ids: [...selected] })}>
            Add to talent pool
          </Button>
          <Button size="sm" tone="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      {/* The list */}
      <div className="overflow-hidden rounded-[14px] border border-hairline">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left text-[13.5px]">
            <thead className="bg-mist/60">
              <tr>
                <th className="w-9 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    className="size-4 accent-[#1b4dff]"
                    checked={groups.main.length > 0 && groups.main.every((r) => selected.has(r.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(groups.main.map((r) => r.id)) : new Set())}
                  />
                </th>
                {columns.map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2 text-[12px] font-medium text-slate">
                    <button type="button" className="hover:text-ink" onClick={() => setSort({ key: c, dir: sort.key === c && sort.dir === "desc" ? "asc" : c === "rank" || c === "name" ? "asc" : "desc" })}>
                      {c.startsWith("req:") ? <span className="block max-w-[9rem] truncate">{columnLabel(c, p.requirements)}</span> : columnLabel(c, p.requirements)}
                      {sort.key === c ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.main.map((r) => (
                <TableRow key={r.id} r={r} {...rowProps(r)} />
              ))}
              {groups.main.length === 0 && groups.pending.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-10 text-center text-slate">
                    {p.rows.length === 0 ? "No candidates yet. Add CVs in the toolbar above." : "Nobody matches these filters."}
                  </td>
                </tr>
              ) : null}
              {groups.below.length ? (
                <GroupRow label={`Below the bar (${groups.below.length})`} open={showBelow} onToggle={() => setShowBelow(!showBelow)} span={columns.length + 1} hint="Check whether anyone good got cut." />
              ) : null}
              {showBelow ? groups.below.map((r) => <TableRow key={r.id} r={r} {...rowProps(r)} />) : null}
              {groups.removed.length ? (
                <GroupRow label={`Removed by hard filters (${groups.removed.length})`} open={showRemoved} onToggle={() => setShowRemoved(!showRemoved)} span={columns.length + 1} />
              ) : null}
              {showRemoved ? groups.removed.map((r) => <TableRow key={r.id} r={r} {...rowProps(r)} />) : null}
              {[...groups.pending, ...groups.broken].map((r) => (
                <tr key={r.id} className="border-t border-hairline text-slate">
                  <td />
                  <td colSpan={columns.length} className="px-3 py-2">
                    <span className="text-ink">{r.filename ?? r.name}</span> ·{" "}
                    <span className={r.status === "unreadable" || r.status === "failed" ? "text-alert" : ""}>{r.reasonCode === "duplicate" ? "Duplicate of an earlier application" : STATUS_LABEL[r.status]}</span>
                    {r.problem ? <span className="text-slate">: {r.problem}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phones: cards */}
        <ul className="divide-y divide-hairline md:hidden">
          {[...groups.main, ...(showBelow ? groups.below : [])].map((r) => (
            <li key={r.id} data-row={r.id}>
              <Link href={`/console/c/${r.id}`} className="block px-4 py-3 active:bg-mist">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.rank ? <span className="mr-1.5 font-mono text-[12px] text-slate">{r.rank}</span> : null}
                      {r.name}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[13px] text-slate">{r.strength}</p>
                    {r.gap ? <p className="line-clamp-1 text-[13px] text-slate">{r.gap}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[18px] font-medium tabular-nums">{r.score ?? "–"}</p>
                    <div className="mt-1">
                      <BandBadge band={r.band} />
                    </div>
                  </div>
                </div>
                {r.decision !== "none" ? (
                  <div className="mt-2">
                    <DecisionBadge decision={r.decision} />
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
          {groups.below.length && !showBelow ? (
            <li>
              <button type="button" onClick={() => setShowBelow(true)} className="w-full px-4 py-3 text-left text-[13px] text-signal">
                Show below the bar ({groups.below.length})
              </button>
            </li>
          ) : null}
          {[...groups.pending, ...groups.broken].map((r) => (
            <li key={r.id} className="px-4 py-2.5 text-[13px] text-slate">
              {r.filename ?? r.name} · {STATUS_LABEL[r.status]}
              {r.problem ? `: ${r.problem}` : ""}
            </li>
          ))}
        </ul>
      </div>
      {groups.droppedHidden ? (
        <button type="button" onClick={() => setHideDropped(false)} className="justify-self-start text-[12.5px] text-slate hover:text-ink">
          {groups.droppedHidden} dropped hidden · show
        </button>
      ) : !hideDropped && p.scope === "ranking" ? (
        <button type="button" onClick={() => setHideDropped(true)} className="justify-self-start text-[12.5px] text-slate hover:text-ink">
          Hide dropped
        </button>
      ) : null}

      {/* Candidate panel */}
      {openId ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Candidate">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/20" onClick={close} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[44rem] flex-col bg-paper shadow-lift-hover">
            <div className="flex items-center justify-between gap-2 border-b border-hairline px-5 py-3">
              <div className="flex items-center gap-1 text-[12.5px] text-slate">
                <Kbd>j</Kbd>
                <Kbd>k</Kbd> next and previous · <Kbd>Esc</Kbd> close
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/console/c/${openId}`} className={buttonClass("ghost", "sm")}>
                  Full page
                </Link>
                <Button size="sm" onClick={close}>
                  Close
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {panel ? (
                <CandidateView key={panel.id + panel.header.decision} data={panel} reasons={p.reasons} canAsk={p.canAsk} neighbours={neighbours} onChanged={refreshAll} />
              ) : (
                <p className="text-slate">Loading…</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {dialog ? (
        <Dialogs
          dialog={dialog}
          reasons={p.reasons}
          rows={p.rows}
          reqs={p.requirements}
          roleId={p.roleId}
          scope={p.scope}
          config={{ columns, filters, sort, density }}
          pending={pending}
          onClose={() => setDialog(null)}
          onDone={(msg) => {
            setDialog(null);
            setSelected(new Set());
            setToast(msg);
            refreshAll();
          }}
          start={start}
        />
      ) : null}

      {toast ? (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] text-paper shadow-lift-hover" onAnimationEnd={() => setToast(null)}>
          {toast}
          <button type="button" className="ml-3 text-paper/70" onClick={() => setToast(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );

  function rowProps(r: Row) {
    return {
      columns,
      reqs: p.requirements,
      pad,
      compact: density === "compact",
      focused: focused?.id === r.id,
      selected: selected.has(r.id),
      comparing: compare.includes(r.id),
      onOpen: () => {
        setFocus(nav.findIndex((x) => x.id === r.id));
        open(r.id);
      },
      onSelect: () => toggleSelect(r.id),
    };
  }
}

function GroupRow({ label, open, onToggle, span, hint }: { label: string; open: boolean; onToggle: () => void; span: number; hint?: string }) {
  return (
    <tr className="border-t border-hairline bg-mist/50">
      <td colSpan={span} className="px-3 py-2">
        <button type="button" onClick={onToggle} aria-expanded={open} className="text-[13px] font-medium text-ink hover:underline">
          {open ? "▾" : "▸"} {label}
        </button>
        {hint && !open ? <span className="ml-2 text-[12.5px] text-slate">{hint}</span> : null}
      </td>
    </tr>
  );
}

function TableRow(props: {
  r: Row;
  columns: string[];
  reqs: Req[];
  pad: string;
  compact: boolean;
  focused: boolean;
  selected: boolean;
  comparing: boolean;
  onOpen: () => void;
  onSelect: () => void;
}) {
  const { r } = props;
  return (
    <tr
      data-row={r.id}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("input,button,a")) return;
        props.onOpen();
      }}
      className={`cursor-pointer border-t border-hairline align-top transition-colors hover:bg-mist/60 ${props.focused ? "bg-signal/[0.04] shadow-[inset_2px_0_0_var(--color-signal)]" : ""} ${r.decision === "dropped" ? "text-slate" : ""}`}
    >
      <td className={`px-3 ${props.pad}`}>
        <input type="checkbox" aria-label={`Select ${r.name}`} checked={props.selected} onChange={props.onSelect} className="size-4 accent-[#1b4dff]" />
      </td>
      {props.columns.map((c) => (
        <td key={c} className={`px-3 ${props.pad} ${c === "reason" ? "min-w-[18rem] max-w-[28rem]" : "whitespace-nowrap"}`}>
          <Cell r={r} c={c} reqs={props.reqs} compact={props.compact} comparing={props.comparing} />
        </td>
      ))}
    </tr>
  );
}

function Cell({ r, c, reqs, compact, comparing }: { r: Row; c: string; reqs: Req[]; compact: boolean; comparing: boolean }) {
  if (c.startsWith("req:")) return <VerdictMark v={(r.verdicts[c.slice(4)] ?? "unknown") as VerdictValue} />;
  if (c.startsWith("fact:")) {
    const f = r.facts[c.slice(5)];
    if (!f) return <span className="text-slate/60">–</span>;
    return (
      <span title={f.s ? "Stated" : "Inferred by Winnow"}>
        {cellText(r, c, reqs).replace(" (inferred)", "")}
        {!f.s ? <span className="ml-1 text-[11px] text-caution">inferred</span> : null}
      </span>
    );
  }
  switch (c) {
    case "rank":
      return <span className="font-mono text-[12.5px] tabular-nums text-slate">{r.rank ?? "–"}</span>;
    case "name":
      return (
        <span className="font-medium">
          {r.name}
          {comparing ? <span className="ml-1.5 text-[11px] font-normal text-signal">compare</span> : null}
          {r.decision !== "none" ? (
            <span className="ml-1.5">
              <DecisionBadge decision={r.decision} />
            </span>
          ) : null}
        </span>
      );
    case "reason":
      return (
        <div className="grid gap-0.5 whitespace-normal leading-snug">
          <span className={compact ? "line-clamp-1" : "line-clamp-2"}>{r.strength}</span>
          {r.gap ? <span className={`text-slate ${compact ? "line-clamp-1" : "line-clamp-2"}`}>{r.gap}</span> : null}
        </div>
      );
    case "must":
      return r.mustTotal ? (
        <span className={`font-mono text-[12.5px] tabular-nums ${r.mustMet === r.mustTotal ? "text-ink" : "text-slate"}`}>
          {r.mustMet}/{r.mustTotal}
        </span>
      ) : (
        <span className="text-slate">–</span>
      );
    case "evidence":
      return <Evidence value={r.evidence} />;
    case "source":
      return <span>{SOURCE_LABEL[r.source] ?? r.source}</span>;
    case "percentile":
      return <span className="font-mono text-[12.5px] tabular-nums">{r.percentile ?? "–"}</span>;
    case "score":
      return <span className="font-mono text-[14px] font-medium tabular-nums">{r.score ?? "–"}</span>;
    case "band":
      return <BandBadge band={r.band} />;
    case "contradictions":
      return r.contradictions ? <Badge tone="caution">{r.contradictions}</Badge> : <span className="text-slate">–</span>;
    case "decision":
      return r.decision === "none" ? <span className="text-slate">Undecided</span> : <DecisionBadge decision={r.decision} />;
    default:
      return <span>{cellText(r, c, reqs) || <span className="text-slate">–</span>}</span>;
  }
}

function ColumnMenu({ reqs, columns, onChange, onClose }: { reqs: Req[]; columns: string[]; onChange: (c: string[]) => void; onClose: () => void }) {
  const toggle = (id: string) => onChange(columns.includes(id) ? columns.filter((c) => c !== id) : [...columns, id]);
  const box = (id: string, label: string) => (
    <label key={id} className="flex items-center gap-2 rounded-[8px] px-2 py-1 hover:bg-mist">
      <input type="checkbox" checked={columns.includes(id)} onChange={() => toggle(id)} className="size-3.5 accent-[#1b4dff]" />
      <span className="truncate">{label}</span>
    </label>
  );
  return (
    <div className="absolute left-0 top-9 z-30 max-h-[70vh] w-[min(22rem,90vw)] overflow-y-auto rounded-[12px] border border-hairline bg-paper p-2 text-[13px] shadow-lift-hover">
      <p className="px-2 py-1 text-[11.5px] font-medium text-slate">Rubric</p>
      {reqs.map((r) => box(`req:${r.key}`, r.text))}
      <p className="mt-2 px-2 py-1 text-[11.5px] font-medium text-slate">Read off the application</p>
      {Object.entries(FACT_LABEL).map(([k, v]) => box(`fact:${k}`, v))}
      <p className="mt-2 px-2 py-1 text-[11.5px] font-medium text-slate">Ranking and decisions</p>
      {META_COLUMNS.map((m) => box(m.id, m.label))}
      <div className="mt-2 flex justify-end gap-2 border-t border-hairline pt-2">
        <Button size="sm" tone="ghost" onClick={() => onChange(DEFAULT_COLUMNS)}>
          Reset
        </Button>
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function FilterMenu({ reqs, onAdd, onClose }: { reqs: Req[]; onAdd: (f: Filter) => void; onClose: () => void }) {
  const [kind, setKind] = useState("req");
  const [key, setKey] = useState(reqs[0]?.key ?? "");
  const [states, setStates] = useState<VerdictValue[]>(["unknown"]);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [field, setField] = useState("notice_period_days");
  const [op, setOp] = useState<"contains" | "lte" | "gte" | "known" | "unknown">("lte");
  const [value, setValue] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const add = (f: Filter) => {
    onAdd(f);
    onClose();
  };
  const preset = (fs: Filter[]) => {
    fs.forEach(onAdd);
    onClose();
  };
  const must = reqs.find((r) => r.mustHave) ?? reqs[0];
  const other = reqs.find((r) => r.key !== must?.key);
  return (
    <div className="absolute left-0 top-9 z-30 w-[min(24rem,90vw)] rounded-[12px] border border-hairline bg-paper p-3 text-[13px] shadow-lift-hover">
      <p className="text-[11.5px] font-medium text-slate">Worth building deliberately</p>
      <div className="mt-1.5 grid gap-1.5">
        {must && other ? (
          <button type="button" className="rounded-[8px] bg-mist px-2.5 py-1.5 text-left hover:bg-hairline" onClick={() => preset([{ t: "req", key: other.key, states: ["unknown"] }, { t: "req", key: must.key, states: ["met"] }])}>
            Unknown on one requirement, met on another
            <span className="block text-[12px] text-slate">A cohort to send one question to</span>
          </button>
        ) : null}
        <button type="button" className="rounded-[8px] bg-mist px-2.5 py-1.5 text-left hover:bg-hairline" onClick={() => preset([{ t: "musthaves", value: "all" }, { t: "score", max: 60 }])}>
          All must-haves met, score below 60
          <span className="block text-[12px] text-slate">Where the rubric is probably wrong</span>
        </button>
      </div>
      <div className="mt-3 grid gap-2 border-t border-hairline pt-3">
        <select aria-label="Filter on" value={kind} onChange={(e) => setKind(e.target.value)} className={`${fieldClass} h-8`}>
          <option value="req">A requirement&rsquo;s state</option>
          <option value="score">Score range</option>
          <option value="confidence">Confidence range</option>
          <option value="band">Band</option>
          <option value="source">Source</option>
          <option value="decision">Decision</option>
          <option value="fact">An application field</option>
          <option value="musthaves">Must-haves</option>
          <option value="flag">Flags</option>
        </select>
        {kind === "req" ? (
          <>
            <select aria-label="Requirement" value={key} onChange={(e) => setKey(e.target.value)} className={`${fieldClass} h-8`}>
              {reqs.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.text}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              {(["met", "partial", "not_met", "unknown"] as VerdictValue[]).map((s) => (
                <label key={s} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={states.includes(s)} onChange={() => setStates(states.includes(s) ? states.filter((x) => x !== s) : [...states, s])} className="size-3.5 accent-[#1b4dff]" />
                  {VERDICT_LABEL[s]}
                </label>
              ))}
            </div>
          </>
        ) : null}
        {kind === "score" || kind === "confidence" ? (
          <div className="flex gap-2">
            <input aria-label="From" value={min} onChange={(e) => setMin(e.target.value)} placeholder="from" inputMode="numeric" className={`${fieldClass} h-8`} />
            <input aria-label="To" value={max} onChange={(e) => setMax(e.target.value)} placeholder="to" inputMode="numeric" className={`${fieldClass} h-8`} />
          </div>
        ) : null}
        {kind === "band" || kind === "source" || kind === "decision" ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(kind === "band" ? BAND_LABEL : kind === "source" ? SOURCE_LABEL : { none: "Undecided", shortlisted: "Shortlisted", dropped: "Dropped", held: "Held" }).map(([k, v]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" checked={values.includes(k)} onChange={() => setValues(values.includes(k) ? values.filter((x) => x !== k) : [...values, k])} className="size-3.5 accent-[#1b4dff]" />
                {v}
              </label>
            ))}
          </div>
        ) : null}
        {kind === "fact" ? (
          <div className="grid gap-2">
            <select aria-label="Field" value={field} onChange={(e) => setField(e.target.value)} className={`${fieldClass} h-8`}>
              {Object.entries(FACT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select aria-label="Condition" value={op} onChange={(e) => setOp(e.target.value as typeof op)} className={`${fieldClass} h-8 w-auto`}>
                <option value="lte">at most</option>
                <option value="gte">at least</option>
                <option value="contains">contains</option>
                <option value="known">is known</option>
                <option value="unknown">is unknown</option>
              </select>
              {op !== "known" && op !== "unknown" ? <input aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)} placeholder={field.endsWith("ctc") ? "lakh" : ""} className={`${fieldClass} h-8`} /> : null}
            </div>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button size="sm" tone="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            tone="primary"
            onClick={() => {
              if (kind === "req") add({ t: "req", key, states });
              else if (kind === "score" || kind === "confidence") add({ t: kind, min: min ? Number(min) : undefined, max: max ? Number(max) : undefined });
              else if (kind === "band") add({ t: "band", values: values as Band[] });
              else if (kind === "source") add({ t: "source", values });
              else if (kind === "decision") add({ t: "decision", values });
              else if (kind === "fact") add({ t: "fact", field, op, value });
              else if (kind === "musthaves") add({ t: "musthaves", value: "all" });
              else add({ t: "flag", value: "contradiction" });
            }}
          >
            Add filter
          </Button>
        </div>
      </div>
    </div>
  );
}

function Dialogs(props: {
  dialog: NonNullable<Dialog>;
  reasons: Reason[];
  rows: Row[];
  reqs: Req[];
  roleId: string;
  scope: "ranking" | "candidates";
  config: ViewConfig;
  pending: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
  start: (fn: () => Promise<void>) => void;
}) {
  const d = props.dialog;
  const ids = "ids" in d ? d.ids : [];
  const people = props.rows.filter((r) => ids.includes(r.id));
  const applies = d.kind === "decide" ? props.reasons.filter((r) => r.applies === "any" || r.applies === (d.decision === "shortlisted" ? "shortlist" : d.decision === "held" ? "hold" : "drop")) : [];
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState(applies[0]?.code ?? "");
  const [note, setNote] = useState("");
  const [text, setText] = useState(d.kind === "ask" && people.length === 1 ? (people[0].suggestions[0]?.text ?? "") : "");
  const [name, setName] = useState("");

  const go = (fn: () => Promise<{ ok: boolean; error?: string; failed?: string[] }>, msg: string) =>
    props.start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else if (r.failed?.length) setError(r.failed.join(" "));
      else props.onDone(msg);
    });

  let title = "";
  let body: React.ReactNode = null;
  if (d.kind === "decide") {
    title = `${d.decision === "shortlisted" ? "Shortlist" : d.decision === "held" ? "Hold" : "Drop"} ${people.length === 1 ? people[0].name : `${people.length} candidates`}`;
    body = (
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          go(() => decide({ ids, decision: d.decision, reasonCode: reason, note }), `${d.decision === "shortlisted" ? "Shortlisted" : d.decision === "held" ? "Held" : "Dropped"} ${ids.length}`);
        }}
      >
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium">Reason (required)</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass}>
            {applies.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" className={fieldClass} />
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <button type="submit" autoFocus disabled={props.pending || !reason} className={buttonClass(d.decision === "dropped" ? "danger" : "primary")}>
            Confirm <Kbd>↵</Kbd>
          </button>
        </div>
      </form>
    );
  } else if (d.kind === "ask") {
    title = people.length === 1 ? `Ask ${people[0].name}` : `Send the same question to ${people.length}`;
    body = (
      <div className="grid gap-3">
        {people.length === 1 && people[0].suggestions.length > 1 ? (
          <div className="grid gap-1">
            {people[0].suggestions.map((s, i) => (
              <button key={i} type="button" onClick={() => setText(s.text)} className="rounded-[8px] bg-mist px-2.5 py-1.5 text-left text-[13px] hover:bg-hairline">
                {s.text}
              </button>
            ))}
          </div>
        ) : null}
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Your question" aria-label="Question" className={`${areaClass} min-h-0`} />
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button disabled={props.pending || !text.trim()} onClick={() => go(() => askQuestions(ids.map((applicationId) => ({ applicationId, items: [{ requirementKey: null, text }] })), false), "Saved as drafts")}>
            Save as drafts
          </Button>
          <Button tone="primary" disabled={props.pending || !text.trim()} onClick={() => go(() => askQuestions(ids.map((applicationId) => ({ applicationId, items: [{ requirementKey: null, text }] })), true), `Sent to ${ids.length}`)}>
            Send now
          </Button>
        </div>
      </div>
    );
  } else if (d.kind === "pool") {
    title = `Add ${ids.length} to a talent pool`;
    body = (
      <div className="grid gap-3">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Pool name, e.g. Silver medallists" aria-label="Pool name" className={fieldClass} />
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button tone="primary" disabled={props.pending} onClick={() => go(() => addToPool(ids, name), "Added to the talent pool")}>
            Add
          </Button>
        </div>
      </div>
    );
  } else if (d.kind === "save") {
    title = "Save this view";
    body = (
      <div className="grid gap-3">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="View name" aria-label="View name" className={fieldClass} />
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button tone="primary" disabled={props.pending || !name.trim()} onClick={() => go(() => saveView({ roleId: props.roleId, scope: props.scope, name, config: props.config }), "View saved")}>
            Save
          </Button>
        </div>
      </div>
    );
  } else {
    title = "Keyboard";
    const keys: [string, string][] = [
      ["j  k", "Move down and up"],
      ["Enter", "Open the candidate"],
      ["p", "Shortlist"],
      ["x", "Drop"],
      ["a", "Ask a question"],
      ["c", "Add to compare"],
      ["/", "Search"],
      ["?", "This list"],
      ["Esc", "Close"],
    ];
    body = (
      <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-[13.5px]">
        {keys.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="flex gap-1">
              {k.split("  ").map((x) => (
                <Kbd key={x}>{x}</Kbd>
              ))}
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/25" onClick={props.onClose} />
      <div className="relative w-full max-w-[28rem] rounded-t-[18px] bg-paper p-5 shadow-lift-hover sm:rounded-[18px]">
        <h2 className="font-display text-[16px] font-semibold">{title}</h2>
        {error ? (
          <p role="alert" className="mt-3 rounded-[10px] bg-alert/[0.06] px-3 py-2 text-[13px] text-alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4">{body}</div>
      </div>
    </div>
  );
}
