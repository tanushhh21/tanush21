"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TalentRow } from "@/lib/console/data/talent";
import { poolPeople, rerankAgainst, setConsent, tagPeople } from "@/lib/console/actions/talent";
import { Badge, Button, fieldClass, smallFieldClass } from "@/components/console/ui";
import { BandBadge } from "@/components/console/candidate/bits";
import { DECISION_LABEL, download, inrShort, reasonLabel } from "@/components/console/ranking/model";

const STAGE_WORD: Record<string, string> = { new: "not decided", screening: "not decided", shortlisted: "shortlisted", interviewing: "interviewing", offer: "offer out", hired: "hired", dropped: "dropped", on_hold: "on hold" };
import type { Band } from "@/lib/db/schema";

const CONSENT = { unknown: "Consent unknown", given: "Consent given", withdrawn: "Consent withdrawn" } as const;

export default function TalentList({
  rows,
  pools,
  openRoles,
  canRerank,
  initialView,
  truncated,
}: {
  rows: TalentRow[];
  pools: { id: string; name: string; n: number }[];
  openRoles: { id: string; title: string }[];
  canRerank: boolean;
  initialView: "all" | "silver";
  truncated: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [silver, setSilver] = useState(initialView === "silver");
  const [pool, setPool] = useState("");
  const [tag, setTag] = useState("");
  const [consent, setConsentF] = useState("");
  const [decision, setDecision] = useState("");
  const [minYears, setMinYears] = useState("");
  const [maxCtc, setMaxCtc] = useState("");
  const [maxNotice, setMaxNotice] = useState("");
  const [more, setMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [target, setTarget] = useState(openRoles[0]?.id ?? "");
  const [tagText, setTagText] = useState("");
  const [poolText, setPoolText] = useState("");
  const search = useRef<HTMLInputElement>(null);

  const tags = useMemo(() => [...new Set(rows.flatMap((r) => r.tags))].sort(), [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const yrs = Number(minYears) || 0;
    const ctc = Number(maxCtc) ? Number(maxCtc) * 100000 : 0;
    const notice = maxNotice === "" ? null : Number(maxNotice);
    return rows.filter(
      (r) =>
        (!needle || [r.name, r.email, r.title, r.company, r.city, ...r.tags, r.last.role].some((v) => v?.toLowerCase().includes(needle))) &&
        (!silver || r.silver) &&
        (!pool || r.pools.includes(pool)) &&
        (!tag || r.tags.includes(tag)) &&
        (!consent || r.consent === consent) &&
        (!decision || r.last.decision === decision) &&
        (!yrs || (r.years != null && r.years >= yrs)) &&
        (!ctc || (r.expectedCtc != null && r.expectedCtc <= ctc)) &&
        (notice == null || Number.isNaN(notice) || (r.notice != null && r.notice <= notice)),
    );
  }, [rows, q, silver, pool, tag, consent, decision, minYears, maxCtc, maxNotice]);

  useEffect(() => setCursor((c) => Math.min(c, Math.max(0, shown.length - 1))), [shown.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "Escape" && t === search.current) return search.current?.blur();
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const row = shown[cursor];
      if (e.key === "j") setCursor((c) => Math.min(shown.length - 1, c + 1));
      else if (e.key === "k") setCursor((c) => Math.max(0, c - 1));
      else if (e.key === "/") search.current?.focus();
      else if (e.key === " " && row) toggle(row.id);
      else if (e.key === "Enter" && row) router.push(`/console/c/${row.last.applicationId}`);
      else if (e.key === "o" && row) setOpen(open === row.id ? null : row.id);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    document.querySelector(`[data-person="${shown[cursor]?.id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, shown]);

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const ids = selected.size ? [...selected] : [];
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ?? "Done") : (r.error ?? "Something went wrong."));
      if (r.ok) router.refresh();
    });

  const exportCsv = () => {
    const list = selected.size ? shown.filter((r) => selected.has(r.id)) : shown;
    const esc = (v: string | number | null | undefined) => {
      const s = v == null ? "" : String(v);
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const head = ["Name", "Email", "Current title", "Company", "City", "Years", "Expected CTC", "Notice (days)", "Last role", "Stage", "Decision", "Reason", "Best score", "Silver medallist on", "Tags", "Pools", "Consent", "Retain until"];
    const body = list.map((r) =>
      [r.name, r.email, r.title, r.company, r.city, r.years, r.expectedCtc, r.notice, r.last.role, r.last.stage, r.last.decision, r.last.reason, r.best?.score, r.silver, r.tags.join("; "), r.pools.join("; "), r.consent, r.retainUntil].map(esc).join(","),
    );
    download(`Talent pool ${new Date().toISOString().slice(0, 10)}.csv`, [head.join(","), ...body].join("\n"));
  };

  const allShown = shown.length > 0 && shown.every((r) => selected.has(r.id));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1">
          <span className="sr-only">Search</span>
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, title, company, city or tag   ( / )" className={fieldClass} />
        </label>
        <Button tone={silver ? "primary" : "secondary"} aria-pressed={silver} onClick={() => setSilver(!silver)} title="People who reached the final stages of a role but were not hired">
          Nearly hired
        </Button>
        <Button tone={more ? "primary" : "secondary"} aria-expanded={more} onClick={() => setMore(!more)}>
          More filters
        </Button>
        <Button tone="ghost" onClick={exportCsv}>
          Download
        </Button>
      </div>
      <div className={`${more ? "flex" : "hidden"} flex-wrap items-center gap-2 text-[13px]`}>
        <select aria-label="Pool" value={pool} onChange={(e) => setPool(e.target.value)} className={smallFieldClass}>
          <option value="">Any pool</option>
          {pools.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name} ({p.n})
            </option>
          ))}
        </select>
        <select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} className={smallFieldClass}>
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select aria-label="Last decision" value={decision} onChange={(e) => setDecision(e.target.value)} className={smallFieldClass}>
          <option value="">Any decision</option>
          {Object.entries(DECISION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label="Consent" value={consent} onChange={(e) => setConsentF(e.target.value)} className={smallFieldClass}>
          <option value="">Any consent</option>
          {Object.entries(CONSENT).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input aria-label="Minimum years" value={minYears} onChange={(e) => setMinYears(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Years ≥" className={`${smallFieldClass} w-20`} />
        <input aria-label="Expected CTC at most, in lakh" value={maxCtc} onChange={(e) => setMaxCtc(e.target.value.replace(/[^\d.]/g, ""))} placeholder="CTC ≤ ₹L" className={`${smallFieldClass} w-24`} />
        <input aria-label="Notice period at most, in days" value={maxNotice} onChange={(e) => setMaxNotice(e.target.value.replace(/\D/g, ""))} placeholder="Notice ≤ days" className={`${smallFieldClass} w-28`} />
      </div>
      <p className="-mt-2 text-[12.5px] text-slate">
        {shown.length.toLocaleString("en-IN")} shown{truncated ? " (the most recent 3,000 people)" : ""}
      </p>

      {selected.size ? (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-[12px] bg-ink px-3 py-2.5 text-[13px] text-paper lg:top-2">
          <span className="font-medium">{selected.size} selected</span>
          {canRerank && openRoles.length ? (
            <>
              <span className="text-paper/60">·</span>
              <select aria-label="Role to score against" value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 rounded-[8px] bg-paper/10 px-2 text-[13px] text-paper">
                {openRoles.map((r) => (
                  <option key={r.id} value={r.id} className="text-ink">
                    {r.title}
                  </option>
                ))}
              </select>
              <button type="button" disabled={pending} onClick={() => run(() => rerankAgainst(target, ids))} className="h-8 rounded-full bg-paper px-3 font-medium text-ink disabled:opacity-50">
                Score against this role
              </button>
            </>
          ) : null}
          <span className="text-paper/60">·</span>
          <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); run(() => tagPeople(ids, tagText)); setTagText(""); }}>
            <input aria-label="Tag" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Tag" className="h-8 w-24 rounded-[8px] bg-paper/10 px-2 text-[13px] text-paper placeholder:text-paper/50" />
            <button type="submit" disabled={pending || !tagText.trim()} className="h-8 rounded-full px-2.5 hover:bg-paper/10 disabled:opacity-50">
              Tag
            </button>
          </form>
          <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); run(() => poolPeople(ids, poolText)); setPoolText(""); }}>
            <input aria-label="Pool" list="pools" value={poolText} onChange={(e) => setPoolText(e.target.value)} placeholder="Pool" className="h-8 w-28 rounded-[8px] bg-paper/10 px-2 text-[13px] text-paper placeholder:text-paper/50" />
            <datalist id="pools">
              {pools.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
            <button type="submit" disabled={pending || !poolText.trim()} className="h-8 rounded-full px-2.5 hover:bg-paper/10 disabled:opacity-50">
              Add to pool
            </button>
          </form>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto h-8 rounded-full px-2.5 text-paper/70 hover:bg-paper/10 hover:text-paper">
            Clear
          </button>
        </div>
      ) : null}
      {msg ? (
        <p role="status" className="rounded-[10px] bg-mist px-3 py-2 text-[13px]">
          {msg}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[14px] border border-hairline">
        <div className="hidden grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-3 border-b border-hairline bg-mist/60 px-3 py-2 text-[12px] font-medium text-slate md:grid">
          <input type="checkbox" aria-label="Select all shown" checked={allShown} onChange={() => setSelected(allShown ? new Set() : new Set(shown.map((r) => r.id)))} className="size-4 accent-[#1b4dff]" />
          <span>Person</span>
          <span>Works as</span>
          <span>Last applied for</span>
          <span>Groups</span>
        </div>
        {shown.length === 0 ? <p className="px-4 py-5 text-[13.5px] text-slate">Nobody matches. Loosen a filter.</p> : null}
        <ul>
          {shown.slice(0, 500).map((r, i) => (
            <li key={r.id} data-person={r.id} className={`relative border-b border-hairline last:border-0 ${i === cursor ? "bg-mist/70" : ""}`} onMouseEnter={() => setCursor(i)}>
              {i === cursor ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-ink" /> : null}
              <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-2.5 text-[13.5px] md:grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
                <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-1 size-4 accent-[#1b4dff]" />
                <div className="min-w-0">
                  <Link href={`/console/c/${r.last.applicationId}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  {r.silver ? <Badge tone="signal" className="ml-2">Nearly hired: {r.silver}</Badge> : null}
                  <span className="block truncate text-[12px] text-slate">{r.email ?? "No email"}</span>
                </div>
                <div className="col-start-2 min-w-0 md:col-start-auto">
                  <span className="block truncate">{[r.title, r.company].filter(Boolean).join(" at ") || <span className="text-slate">Not stated</span>}</span>
                  <span className="block truncate text-[12px] tabular-nums text-slate">
                    {[r.city, r.years != null ? `${r.years} years` : null, r.expectedCtc ? `expects ${inrShort(r.expectedCtc)}` : null, r.notice != null ? `notice ${r.notice} days` : null].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div className="col-start-2 min-w-0 md:col-start-auto">
                  <span className="block truncate">
                    {r.last.role}
                    {r.applications > 1 ? <span className="text-slate"> · {r.applications} applications</span> : null}
                  </span>
                  <span className="flex items-center gap-1.5 text-[12px] text-slate">
                    {r.last.decision === "none" ? (
                      r.best?.band ? <BandBadge band={r.best.band as Band} /> : "Not decided"
                    ) : (
                      <>
                        {(STAGE_WORD[r.last.stage] ?? DECISION_LABEL[r.last.decision] ?? r.last.decision).replace(/^\w/, (c) => c.toUpperCase())}
                        {r.last.reason ? ` · ${reasonLabel(r.last.reason).toLowerCase()}` : ""}
                      </>
                    )}
                  </span>
                </div>
                <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-1 md:col-start-auto">
                  {r.tags.map((t) => (
                    <Badge key={t} tone="muted">#{t}</Badge>
                  ))}
                  {r.pools.map((p) => (
                    <Badge key={p} tone="neutral">{p}</Badge>
                  ))}
                  {r.consent !== "given" ? <span className={`text-[12px] ${r.consent === "withdrawn" ? "text-alert" : "text-slate"}`}>{CONSENT[r.consent]}</span> : null}
                  <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-label={`Tags, groups and consent for ${r.name}`} className="text-[12px] text-slate/70 hover:text-ink hover:underline" aria-expanded={open === r.id}>
                    Edit
                  </button>
                </div>
              </div>
              {open === r.id ? <PersonEdit row={r} pending={pending} run={run} /> : null}
            </li>
          ))}
        </ul>
        {shown.length > 500 ? <p className="border-t border-hairline px-4 py-3 text-[12.5px] text-slate">Showing the first 500. Search or filter to narrow it; export includes everyone shown.</p> : null}
      </div>
    </div>
  );
}

function PersonEdit({ row, pending, run }: { row: TalentRow; pending: boolean; run: (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => void }) {
  const [consent, setC] = useState(row.consent);
  const [until, setUntil] = useState(row.retainUntil ?? "");
  return (
    <div className="mx-3 mb-3 grid gap-3 rounded-[12px] border border-hairline bg-paper p-3 text-[13px] md:ml-14">
      <div className="flex flex-wrap items-end gap-2">
        <label>
          <span className="block text-[12px] text-slate">Consent</span>
          <select value={consent} onChange={(e) => setC(e.target.value as TalentRow["consent"])} className={smallFieldClass}>
            {Object.entries(CONSENT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-[12px] text-slate">Keep the record until</span>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={smallFieldClass} />
        </label>
        <Button size="sm" disabled={pending} onClick={() => run(() => setConsent(row.id, consent, until || null))}>
          Save
        </Button>
      </div>
      {consent === "withdrawn" ? <p className="text-[12.5px] text-slate">Withdrawn: Winnow will not contact or re-rank this person.</p> : null}
      {row.tags.length || row.pools.length ? (
        <div className="flex flex-wrap gap-1.5">
          {row.tags.map((t) => (
            <Button key={t} size="sm" tone="ghost" disabled={pending} onClick={() => run(() => tagPeople([row.id], t, true))}>
              Remove #{t}
            </Button>
          ))}
          {row.pools.map((p) => (
            <Button key={p} size="sm" tone="ghost" disabled={pending} onClick={() => run(() => poolPeople([row.id], p, true))}>
              Remove from {p}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
