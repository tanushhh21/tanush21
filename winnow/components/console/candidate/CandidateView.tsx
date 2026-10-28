"use client";

import { useState, useTransition } from "react";
import type { Candidate } from "@/lib/console/data/candidate";
import type { Reason } from "@/lib/console/data/ranking";
import { addNote, decide, deeper, resolveContradiction, setInterest, undecide } from "@/lib/console/actions/candidates";
import { askQuestions } from "@/lib/console/actions/questions";
import { Badge, Button, ago, areaClass, dateLabel, fieldClass, smallFieldClass } from "@/components/console/ui";
import { BandBadge, DecisionBadge, Evidence, VerdictMark } from "./bits";
import { FACT_LABEL, SOURCE_LABEL } from "@/components/console/ranking/model";

type Props = {
  data: Candidate;
  reasons: Reason[];
  canAsk: boolean;
  neighbours?: { id: string; name: string; rank: number | null }[];
  onChanged?: () => void;
  compact?: boolean;
};

const SUPPORT: Record<string, string> = { verified: "Verified", supported: "Supported", self_reported: "On their own account" };

function Section({ id, title, meta, children }: { id?: string; title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-hairline pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[14.5px] font-semibold tracking-[-0.01em]">{title}</h3>
        {meta ? <span className="text-[12px] text-slate">{meta}</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function CandidateView({ data, reasons, canAsk, neighbours = [], onChanged }: Props) {
  const h = data.header;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<null | "shortlisted" | "held" | "dropped">(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [asks, setAsks] = useState(data.suggestions.map((s) => ({ ...s, on: true })));
  const [deep, setDeep] = useState<{ kind: string; text: string } | null>(null);
  const [neighbour, setNeighbour] = useState(neighbours[0]?.id ?? "");
  const [resolving, setResolving] = useState<Record<string, string>>({});

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else {
        after?.();
        onChanged?.();
      }
    });

  const applies = (d: "shortlisted" | "held" | "dropped") => reasons.filter((r) => r.applies === "any" || r.applies === (d === "shortlisted" ? "shortlist" : d === "held" ? "hold" : "drop"));
  const known = data.rubric.filter((r) => r.verdict !== "unknown");
  const unresolved = data.rubric.filter((r) => r.verdict === "unknown");

  return (
    <article className="grid gap-5 text-[13.5px]">
      {/* Header */}
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.02em]">{data.person.name}</h2>
            <p className="mt-1 text-slate">
              {data.role.title}
              {data.person.city ? ` · ${data.person.city}` : ""}
              {data.person.email ? ` · ${data.person.email}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[28px] font-medium leading-none tabular-nums tracking-[-0.03em]">{h.score ?? "–"}</p>
            <p className="mt-1 text-[12px] text-slate">{h.rank ? `Rank ${h.rank}` : "Not ranked"}{h.confidence != null ? ` · ${Math.round(h.confidence * 100)}% known` : ""}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <BandBadge band={h.band} />
          <DecisionBadge decision={h.decision} />
          {h.filteredOut ? <Badge tone="muted">Removed by a hard filter</Badge> : null}
          <Badge tone="neutral">{SOURCE_LABEL[h.source] ?? h.source}{h.referredBy ? `, by ${h.referredBy}` : ""}</Badge>
          <span className="text-[12px] text-slate">
            Applied {dateLabel(h.appliedAt)} · {Math.floor((Date.now() - new Date(h.stageChangedAt).getTime()) / 86_400_000)} days at {h.stage.replace("_", " ")}
          </span>
        </div>
        {h.status === "unreadable" || h.status === "failed" ? (
          <p className="mt-3 rounded-[10px] bg-alert/[0.06] px-3 py-2 text-alert">{h.status === "unreadable" ? "Could not be read" : "Scoring failed"}: {h.problem}</p>
        ) : null}
        {h.strength || h.gap ? (
          <div className="mt-4 grid gap-1 rounded-[12px] bg-mist px-4 py-3">
            {h.strength ? (
              <p>
                <span className="text-slate">Strongest: </span>
                {h.strength}
              </p>
            ) : null}
            {h.gap ? (
              <p>
                <span className="text-slate">Sharpest gap: </span>
                {h.gap}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="rounded-[10px] bg-alert/[0.06] px-3 py-2 text-alert">
          {error}
        </p>
      ) : null}

      {/* Decide */}
      <Section id="decide" title="Decide" meta={h.decision !== "none" ? `${h.reasonCode ?? ""}` : "A reason is required"}>
        {h.decision !== "none" && !deciding ? (
          <div className="flex flex-wrap items-center gap-2">
            <DecisionBadge decision={h.decision} />
            <span className="text-slate">{reasons.find((r) => r.code === h.reasonCode)?.label ?? h.reasonCode}</span>
            {h.decisionNote ? <span className="text-slate">· {h.decisionNote}</span> : null}
            <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(() => undecide(data.id))}>
              Undo
            </Button>
          </div>
        ) : null}
        {h.decision === "none" || deciding ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {(["shortlisted", "held", "dropped"] as const).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  tone={deciding === d ? (d === "dropped" ? "danger" : "primary") : "secondary"}
                  onClick={() => {
                    setDeciding(d);
                    setReason(applies(d)[0]?.code ?? "");
                  }}
                >
                  {d === "shortlisted" ? "Shortlist" : d === "held" ? "Hold" : "Drop"}
                </Button>
              ))}
            </div>
            {deciding ? (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <select aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass}>
                  {applies(deciding).map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={fieldClass} />
                <Button
                  tone={deciding === "dropped" ? "danger" : "primary"}
                  disabled={pending || !reason}
                  onClick={() => run(() => decide({ ids: [data.id], decision: deciding, reasonCode: reason, note }), () => setDeciding(null))}
                >
                  Confirm
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Section>

      {/* Against the rubric */}
      <Section
        id="rubric"
        title="Against the rubric"
        meta={data.math.available ? `${fmt(data.math.earned)} of ${fmt(data.math.available)} points on what is known` : "Nothing known yet"}
      >
        <ul className="grid gap-2.5">
          {data.rubric.map((r) => (
            <li key={r.key} className="rounded-[12px] border border-hairline p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-[3px]">
                    <VerdictMark v={r.verdict} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.text}
                      {r.mustHave ? <span className="ml-1.5 text-[11.5px] font-normal text-slate">must-have</span> : null}
                    </p>
                    {r.quote ? <p className="mt-1.5 border-l-2 border-hairline pl-2.5 text-[13px] leading-snug text-ink/80">&ldquo;{r.quote}&rdquo;</p> : null}
                    <p className="mt-1.5 text-[12px] text-slate">
                      {r.verdict === "unknown" ? (
                        "Unresolved: the application does not say. It costs no score."
                      ) : (
                        <>
                          {r.rationale}
                          {r.document ? ` · ${r.document}${r.position != null && r.position >= 0 ? `, character ${r.position}` : ""}` : ""}
                          {r.retrievedAt ? ` · read ${ago(r.retrievedAt)}` : ""}
                          {r.support ? ` · ${SUPPORT[r.support]}` : ""}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-slate" title="Points contributed">
                  {r.verdict === "unknown" ? "–" : `+${fmt(r.contribution)}`}
                  <span className="text-slate/70">/{r.weight}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-slate">
          Score {h.score ?? "–"} = {fmt(data.math.earned)} earned ÷ {fmt(data.math.available)} available on {known.length} known requirement{known.length === 1 ? "" : "s"}.
          {unresolved.length ? ` ${unresolved.length} unresolved; if they all held, the score would be ${data.math.potential}.` : ""} Must-haves met: {data.math.mustMet} of{" "}
          {data.math.mustTotal}.
        </p>
      </Section>

      {/* Contradictions */}
      {data.contradictions.length ? (
        <Section id="contradictions" title="Contradictions" meta="These changed nothing about the score">
          <ul className="grid gap-3">
            {data.contradictions.map((cx) => (
              <li key={cx.id} className="rounded-[12px] border border-hairline p-3">
                <div className="flex items-center gap-2">
                  <Badge tone={cx.resolved ? "muted" : "caution"}>{cx.kind}</Badge>
                  {cx.resolved ? <span className="text-[12px] text-slate">Resolved: {cx.resolution}</span> : null}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <blockquote className="rounded-[10px] bg-mist p-2.5 text-[13px]">
                    &ldquo;{cx.quoteA}&rdquo;
                    <span className="mt-1 block text-[11.5px] text-slate">{cx.sourceA}</span>
                  </blockquote>
                  <blockquote className="rounded-[10px] bg-mist p-2.5 text-[13px]">
                    &ldquo;{cx.quoteB}&rdquo;
                    <span className="mt-1 block text-[11.5px] text-slate">{cx.sourceB}</span>
                  </blockquote>
                </div>
                {!cx.resolved ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      aria-label="How it was resolved"
                      value={resolving[cx.id] ?? ""}
                      onChange={(e) => setResolving({ ...resolving, [cx.id]: e.target.value })}
                      placeholder="How it was resolved"
                      className={fieldClass}
                    />
                    <Button size="sm" disabled={pending || !(resolving[cx.id] ?? "").trim()} onClick={() => run(() => resolveContradiction(cx.id, resolving[cx.id]))}>
                      Resolve
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Questions */}
      <Section id="questions" title="Questions to ask" meta="From the unresolved requirements and contradictions">
        {data.questions.length ? (
          <ul className="mb-3 grid gap-1.5">
            {data.questions.map((q) => (
              <li key={q.id} className="flex items-start justify-between gap-3 rounded-[10px] bg-mist px-3 py-2">
                <span>
                  {q.text}
                  {q.answer ? <span className="mt-1 block text-ink/80">Answer: {q.answer}</span> : null}
                  {q.skipReason ? <span className="mt-1 block text-slate">Skipped: {q.skipReason}</span> : null}
                </span>
                <span className="shrink-0 text-[12px] text-slate">
                  {q.status === "sent" ? `Sent ${ago(q.sentAt)}${q.followups ? `, ${q.followups} follow-up${q.followups === 1 ? "" : "s"}` : ""}` : q.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {canAsk && asks.length ? (
          <div className="grid gap-2">
            {asks.map((a, i) => (
              <label key={i} className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={a.on}
                  onChange={(e) => setAsks(asks.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
                  className="mt-2.5 size-4 shrink-0 accent-[#1b4dff]"
                />
                <textarea
                  aria-label={`Question ${i + 1}`}
                  value={a.text}
                  onChange={(e) => setAsks(asks.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  rows={2}
                  className={`${areaClass} min-h-0`}
                />
              </label>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                tone="primary"
                disabled={pending || !asks.some((a) => a.on)}
                onClick={() =>
                  run(async () => {
                    const r = await askQuestions([{ applicationId: data.id, items: asks.filter((a) => a.on) }], true);
                    if (r.ok && r.failed?.length) return { ok: false, error: r.failed.join(" ") };
                    return r;
                  })
                }
              >
                Send now
              </Button>
              <Button size="sm" disabled={pending || !asks.some((a) => a.on)} onClick={() => run(() => askQuestions([{ applicationId: data.id, items: asks.filter((a) => a.on) }], false))}>
                Save as drafts
              </Button>
            </div>
          </div>
        ) : !data.questions.length ? (
          <p className="text-slate">Nothing to ask: every requirement is resolved.</p>
        ) : null}
      </Section>

      {/* Verification trail */}
      <Section id="trail" title="Verification trail">
        <ul className="grid gap-1 text-[13px]">
          {data.trail.opened.map((d, i) => (
            <li key={i}>
              Opened <span className="font-medium">{d.filename}</span> ({d.kind}){d.status === "unreadable" ? `: could not be read, ${d.error}` : ""} · {ago(d.at)}
            </li>
          ))}
          <li>Found evidence for {data.trail.found} of {data.rubric.length} requirements.</li>
          {data.trail.notFound.length ? (
            <li>
              Looked for and did not find: {data.trail.notFound.join("; ")}. <span className="text-slate">Absence counts against nobody.</span>
            </li>
          ) : null}
        </ul>
      </Section>

      {/* Excluded attributes */}
      <Section id="excluded" title="Excluded from scoring">
        <p className="text-[13px]">
          Removed before scoring: {data.excluded.removed.length ? <>{data.excluded.removed.map((x) => `“${x}”`).join(", ")}, and the candidate&rsquo;s name.</> : "the candidate's name."}
        </p>
        <p className="mt-1 text-[12.5px] text-slate">Never scored: {data.excluded.categories.join(", ")}. They stay visible in the grid, never in the score.</p>
      </Section>

      {/* Application facts */}
      <Section id="facts" title="Application facts">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {data.facts.map((f) => (
            <div key={f.field} className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1.5" title={f.quote ? `“${f.quote}”` : undefined}>
              <dt className="text-slate">{FACT_LABEL[f.field] ?? f.field}</dt>
              <dd className="text-right">
                {f.value ?? <span className="text-slate/70">–</span>}
                {f.value && !f.stated ? <span className="ml-1 text-[11px] text-caution">inferred</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* History */}
      <Section id="history" title="History with this company" meta={data.history.length ? `${data.history.length} earlier` : undefined}>
        {data.history.length === 0 ? (
          <p className="text-slate">First time this person has applied here.</p>
        ) : (
          <ul className="grid gap-2">
            {data.history.map((p) => (
              <li key={p.id} className="rounded-[10px] bg-mist px-3 py-2">
                <p>
                  <span className="font-medium">{p.role}</span> · applied {dateLabel(p.appliedAt)} · <DecisionBadge decision={p.decision} />
                  {p.reasonCode ? <span className="text-slate"> · {p.reasonCode}</span> : null}
                  {p.decidedBy ? <span className="text-slate"> · by {p.decidedBy}</span> : null}
                </p>
                {p.debriefs.map((d, i) => (
                  <p key={i} className="mt-1 text-[12.5px] text-slate">
                    {d.by}: {d.wouldHire.replace("_", " ")}. Strongest: {d.strongest}. Concern: {d.concern}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Communication */}
      <Section id="communication" title="Communication">
        {data.messages.length === 0 ? (
          <p className="text-slate">No messages yet.</p>
        ) : (
          <ul className="grid gap-2">
            {data.messages.map((m) => (
              <li key={m.id} className={`rounded-[12px] px-3 py-2 ${m.direction === "in" ? "bg-mist" : "border border-hairline"}`}>
                <p className="text-[12px] text-slate">
                  {m.direction === "in" ? "From the candidate" : `To the candidate${m.by ? `, by ${m.by}` : ""}`} · {ago(m.at)}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
          <span className="text-slate">Still interested?</span>
          {(["interested", "not_interested"] as const).map((i) => (
            <button key={i} type="button" className="text-signal hover:underline" onClick={() => run(() => setInterest(data.id, i))}>
              {i === "interested" ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </Section>

      {/* Notes */}
      <Section id="notes" title="Notes" meta="Visible to the team. @name to notify someone.">
        {data.notes.length ? (
          <ul className="mb-3 grid gap-2">
            {data.notes.map((n) => (
              <li key={n.id} className="rounded-[10px] bg-mist px-3 py-2">
                <p className="text-[12px] text-slate">
                  {n.by} · {ago(n.at)}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{n.body}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-2">
          <textarea aria-label="Add a note" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={2} placeholder="Add a note" className={`${areaClass} min-h-0`} />
          <div>
            <Button size="sm" disabled={pending || !noteBody.trim()} onClick={() => run(() => addNote(data.id, noteBody), () => setNoteBody(""))}>
              Add note
            </Button>
          </div>
        </div>
      </Section>

      {/* Deeper */}
      <Section id="deeper" title="Deeper, on demand" meta="Each uses one AI call">
        <div className="grid gap-2">
          {neighbours.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>Explain this rank against</span>
              <select aria-label="Neighbour" value={neighbour} onChange={(e) => setNeighbour(e.target.value)} className={smallFieldClass}>
                {neighbours.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.rank ? `#${n.rank} ` : ""}
                    {n.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={pending || !neighbour}
                onClick={() =>
                  start(async () => {
                    const r = await deeper("explain", data.id, neighbour);
                    if (r.ok) setDeep({ kind: "Why this order", text: r.text });
                    else setError(r.error);
                  })
                }
              >
                Explain
              </Button>
            </div>
          ) : null}
          <div>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await deeper("challenge", data.id);
                  if (r.ok) setDeep({ kind: "The case that this ranking is wrong", text: r.text });
                  else setError(r.error);
                })
              }
            >
              Argue this candidate is ranked wrongly
            </Button>
          </div>
          {pending ? <p className="text-slate">Working…</p> : null}
          {deep ? (
            <div className="rounded-[12px] bg-mist px-4 py-3">
              <p className="text-[12px] font-medium text-slate">{deep.kind}</p>
              <p className="mt-1 whitespace-pre-wrap">{deep.text}</p>
            </div>
          ) : null}
        </div>
      </Section>

      <p className="text-[11.5px] text-slate">
        <Evidence value={h.evidence} />
        {h.model ? <span className="ml-2">Scored by {h.model}</span> : null}
        {h.costUsd ? <span> · ${Number(h.costUsd).toFixed(3)}</span> : null}
      </p>
    </article>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
