"use client";

import { useState, useTransition } from "react";
import type { Candidate } from "@/lib/console/data/candidate";
import type { Reason } from "@/lib/console/data/ranking";
import { addNote, decide, deeper, resolveContradiction, setInterest, undecide } from "@/lib/console/actions/candidates";
import { askQuestions } from "@/lib/console/actions/questions";
import { Badge, Button, ago, areaClass, dateLabel, fieldClass, smallFieldClass } from "@/components/console/ui";
import { BandBadge, DecisionBadge, Evidence, VerdictMark } from "./bits";
import { FACT_LABEL, SOURCE_LABEL, matchOf, reasonLabel } from "@/components/console/ranking/model";

type Props = {
  data: Candidate;
  reasons: Reason[];
  canAsk: boolean;
  neighbours?: { id: string; name: string; rank: number | null }[];
  onChanged?: () => void;
  compact?: boolean;
};

const SUPPORT: Record<string, string> = { verified: "confirmed", supported: "stated in the CV", self_reported: "their own claim" };

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
  const unresolved = data.rubric.filter((r) => r.verdict === "unknown");

  const match = matchOf({ score: h.score, confidence: h.confidence });
  const covers = h.confidence != null ? Math.round(h.confidence * 100) : null;
  const fact = (k: string) => data.facts.find((f) => f.field === k && f.value);
  const glance: [string, React.ReactNode][] = [
    ["Now", [fact("current_title")?.value, fact("current_company")?.value].filter(Boolean).join(" at ") || null],
    ["Experience", fact("years_experience")?.value ?? null],
    ["Lives in", [fact("city")?.value ?? data.person.city, fact("willing_to_relocate") ? "will relocate" : null].filter(Boolean).join(", ") || null],
    ["Pay now", fact("current_ctc")?.value ?? null],
    ["Expects", fact("expected_ctc")?.value ?? null],
    ["Notice", fact("notice_period_days")?.value ?? null],
    ["Studied", [fact("degree")?.value, fact("institution")?.value, fact("graduation_year")?.value].filter(Boolean).join(", ") || null],
  ];
  const shown = new Set(["current_title", "current_company", "years_experience", "city", "willing_to_relocate", "current_ctc", "expected_ctc", "notice_period_days", "degree", "institution", "graduation_year"]);
  const rest = data.facts.filter((f) => !shown.has(f.field) && f.value);

  return (
    <article className="@container grid gap-5 text-[13.5px]">
      {/* Header */}
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em]">{data.person.name}</h2>
            <p className="mt-1 text-slate">
              {glance[0][1] ? `${glance[0][1]} · ` : ""}
              {data.person.city ? `${data.person.city} · ` : ""}
              {data.person.email ?? ""}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {h.decision !== "none" ? <DecisionBadge decision={h.decision} stage={h.stage} /> : <BandBadge band={h.band} />}
              {h.filteredOut ? <Badge tone="muted">Removed by a filter</Badge> : null}
              <Badge tone="neutral">
                {SOURCE_LABEL[h.source] ?? h.source}
                {h.referredBy ? `, by ${h.referredBy}` : ""}
              </Badge>
              <span className="text-[12px] text-slate">Applied {dateLabel(h.appliedAt)}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-[34px] font-semibold leading-none tabular-nums tracking-[-0.03em]">{match ?? "–"}</p>
            <p className="mt-1 text-[12px] text-slate">{h.rank ? `match · #${h.rank} for this role` : "Not ranked yet"}</p>
          </div>
        </div>
        {h.status === "unreadable" || h.status === "failed" ? (
          <p className="mt-3 rounded-[10px] bg-alert/[0.06] px-3 py-2 text-alert">{h.status === "unreadable" ? "This CV could not be read" : "Scoring failed"}: {h.problem}</p>
        ) : null}
        {h.strength || h.gap ? (
          <div className="mt-4 grid gap-1.5 rounded-[12px] bg-mist px-4 py-3">
            {h.strength ? (
              <p>
                <span className="font-medium text-ok">Best evidence: </span>
                {h.strength}
              </p>
            ) : null}
            {h.gap ? (
              <p>
                <span className="font-medium text-caution">Biggest gap: </span>
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

      <div className="grid gap-5 [grid-template-areas:'top'_'main'_'bottom'] @3xl:grid-cols-[minmax(0,1fr)_17.5rem] @3xl:grid-rows-[auto_1fr] @3xl:gap-x-8 @3xl:[grid-template-areas:'main_top'_'main_bottom']">
        {/* Decision and the facts at a glance */}
        <div className="grid content-start gap-4 [grid-area:top]">
          <div id="decide" className="scroll-mt-20 rounded-[14px] border border-hairline p-4">
            <h3 className="font-display text-[14.5px] font-semibold">Decision</h3>
            {h.decision !== "none" && !deciding ? (
              <div className="mt-2 grid gap-2">
                <p>
                  <DecisionBadge decision={h.decision} stage={h.stage} /> <span className="text-slate">{reasons.find((r) => r.code === h.reasonCode)?.label ?? reasonLabel(h.reasonCode)}</span>
                </p>
                {h.decisionNote ? <p className="text-slate">{h.decisionNote}</p> : null}
                <div>
                  <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(() => undecide(data.id))}>
                    Undo
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2.5 grid gap-2.5">
                <div className="flex flex-wrap gap-2">
                  {(["shortlisted", "held", "dropped"] as const).map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      tone={deciding === d ? (d === "dropped" ? "danger" : "primary") : d === "shortlisted" ? "primary" : "secondary"}
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
                  <div className="grid gap-2">
                    <select aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass}>
                      {applies(deciding).map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={fieldClass} />
                    <div className="flex gap-2">
                      <Button
                        tone={deciding === "dropped" ? "danger" : "primary"}
                        disabled={pending || !reason}
                        onClick={() => run(() => decide({ ids: [data.id], decision: deciding, reasonCode: reason, note }), () => setDeciding(null))}
                      >
                        Confirm
                      </Button>
                      <Button tone="ghost" onClick={() => setDeciding(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-slate">Every decision needs a reason, so you can see later why people were turned down.</p>
                )}
              </div>
            )}
          </div>

          <div id="facts" className="scroll-mt-20 rounded-[14px] border border-hairline p-4">
            <h3 className="font-display text-[14.5px] font-semibold">At a glance</h3>
            <dl className="mt-2 grid gap-1.5">
              {glance
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
                    <dt className="text-slate">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            {rest.length ? (
              <details className="mt-2 text-[12.5px]">
                <summary className="cursor-pointer text-slate hover:text-ink">More from the CV</summary>
                <dl className="mt-1.5 grid gap-1">
                  {rest.map((f) => (
                    <div key={f.field} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
                      <dt className="text-slate">{FACT_LABEL[f.field] ?? f.field}</dt>
                      <dd>
                        {f.value}
                        {!f.stated ? <span className="ml-1 text-[11px] text-caution">guessed</span> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
          </div>
        </div>

        {/* The evidence */}
        <div className="grid min-w-0 content-start gap-5 [grid-area:main]">
          <Section
            id="rubric"
            title="Against what you asked for"
            meta={covers != null ? `the CV covers ${covers}% of it` : undefined}
          >
            <ul className="grid gap-2">
              {data.rubric.map((r) => (
                <li key={r.key} className="rounded-[12px] border border-hairline p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {r.text}
                        {r.mustHave ? <span className="ml-1.5 rounded-full bg-mist px-1.5 py-[1px] text-[11px] font-normal text-slate">must-have</span> : null}
                      </p>
                      <p className="mt-1">
                        <VerdictMark v={r.verdict} withLabel />
                        {r.support ? <span className="ml-1.5 text-[12px] text-slate">· {SUPPORT[r.support]}</span> : null}
                      </p>
                      {r.quote ? <p className="mt-1.5 border-l-2 border-signal/40 pl-2.5 text-[13px] leading-snug text-ink/85">&ldquo;{r.quote}&rdquo;</p> : null}
                      {r.verdict === "unknown" ? <p className="mt-1 text-[12px] text-slate">The CV does not say. This costs them nothing, but worth asking.</p> : null}
                    </div>
                    <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-slate" title="Points earned of the points this requirement is worth">
                      {r.verdict === "unknown" ? "–" : fmt(r.contribution)}
                      <span className="text-slate/70"> of {r.weight}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] text-slate">
              {h.score != null ? (
                <>
                  They score {h.score} on what the CV shows ({fmt(data.math.earned)} of {fmt(data.math.available)} points). {covers != null && covers < 100 ? `The CV covers ${covers}% of the role, so the match is ${match}.` : `The CV covers the whole role, so the match is ${match}.`}{" "}
                  {unresolved.length ? `If everything the CV is silent on held, they could reach ${data.math.potential}.` : ""} Must-haves met: {data.math.mustMet} of {data.math.mustTotal}.
                </>
              ) : (
                "Not scored yet."
              )}
            </p>
          </Section>

          {data.contradictions.length ? (
            <Section id="contradictions" title="The CV says two different things" meta="This does not change the score">
              <ul className="grid gap-3">
                {data.contradictions.map((cx) => (
                  <li key={cx.id} className="rounded-[12px] border border-hairline p-3">
                    <div className="flex items-center gap-2">
                      <Badge tone={cx.resolved ? "muted" : "caution"}>{cx.kind === "dates" ? "Dates" : cx.kind.charAt(0).toUpperCase() + cx.kind.slice(1)}</Badge>
                      {cx.resolved ? <span className="text-[12px] text-slate">Sorted: {cx.resolution}</span> : null}
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <blockquote className="rounded-[10px] bg-mist p-2.5 text-[13px]">&ldquo;{cx.quoteA}&rdquo;</blockquote>
                      <blockquote className="rounded-[10px] bg-mist p-2.5 text-[13px]">&ldquo;{cx.quoteB}&rdquo;</blockquote>
                    </div>
                    {!cx.resolved ? (
                      <div className="mt-2 flex gap-2">
                        <input
                          aria-label="How it was resolved"
                          value={resolving[cx.id] ?? ""}
                          onChange={(e) => setResolving({ ...resolving, [cx.id]: e.target.value })}
                          placeholder="What is right? e.g. Joined in 2018, CV typo"
                          className={fieldClass}
                        />
                        <Button size="sm" disabled={pending || !(resolving[cx.id] ?? "").trim()} onClick={() => run(() => resolveContradiction(cx.id, resolving[cx.id]))}>
                          Mark sorted
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section id="questions" title="Ask them" meta="Winnow suggests questions for whatever the CV leaves open">
            {data.questions.length ? (
              <ul className="mb-3 grid gap-1.5">
                {data.questions.map((q) => (
                  <li key={q.id} className="flex items-start justify-between gap-3 rounded-[10px] bg-mist px-3 py-2">
                    <span>
                      {q.text}
                      {q.answer ? <span className="mt-1 block text-ink/80">Their answer: {q.answer}</span> : null}
                      {q.skipReason ? <span className="mt-1 block text-slate">Skipped: {q.skipReason}</span> : null}
                    </span>
                    <span className="shrink-0 text-[12px] text-slate">
                      {q.status === "sent" ? `Sent ${ago(q.sentAt)}${q.followups ? `, ${q.followups} reminder${q.followups === 1 ? "" : "s"}` : ""}` : q.status === "drafted" ? "Draft" : q.status === "answered" ? "Answered" : q.status.replace("_", " ")}
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
              <p className="text-slate">Nothing to ask: the CV answers everything.</p>
            ) : null}
          </Section>

          <Section id="communication" title="Messages">
            {data.messages.length === 0 ? (
              <p className="text-slate">No messages yet.</p>
            ) : (
              <ul className="grid gap-2">
                {data.messages.map((m) => (
                  <li key={m.id} className={`rounded-[12px] px-3 py-2 ${m.direction === "in" ? "bg-mist" : "border border-hairline"}`}>
                    <p className="text-[12px] text-slate">
                      {m.direction === "in" ? `From ${data.person.name.split(" ")[0]}` : `To ${data.person.name.split(" ")[0]}${m.by ? `, from ${m.by}` : ""}`} · {ago(m.at)}
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

          <Section id="deeper" title="Ask the AI about this ranking" meta="Each answer uses one AI call">
            <div className="grid gap-2">
              {neighbours.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span>Why are they ranked against</span>
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
                  Argue they are ranked wrongly
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

          <details id="trail" className="scroll-mt-20 rounded-[12px] border border-hairline px-4 py-3">
            <summary className="cursor-pointer font-display text-[14px] font-semibold">How this was scored</summary>
            <ul className="mt-2 grid gap-1 text-[13px]">
              {data.trail.opened.map((d, i) => (
                <li key={i}>
                  Read <span className="font-medium">{d.filename}</span>
                  {d.status === "unreadable" ? `: could not be read, ${d.error}` : ""} · {ago(d.at)}
                </li>
              ))}
              <li>
                Found evidence for {data.trail.found} of {data.rubric.length} requirements.
              </li>
              {data.trail.notFound.length ? (
                <li>
                  Looked for and did not find: {data.trail.notFound.join("; ")}. <span className="text-slate">Absence counts against nobody.</span>
                </li>
              ) : null}
              <li>
                Removed before scoring: {data.excluded.removed.length ? <>{data.excluded.removed.map((x) => `“${x}”`).join(", ")}, and their name.</> : "their name."} Never scored: {data.excluded.categories.join(", ")}.
              </li>
              <li className="text-slate">
                Evidence: <Evidence value={h.evidence} />
                {h.model ? ` · scored by ${h.model}` : ""}
                {h.costUsd ? ` · $${Number(h.costUsd).toFixed(3)}` : ""}
              </li>
            </ul>
          </details>
        </div>

        {/* Notes and history */}
        <div className="grid content-start gap-4 [grid-area:bottom]">
          <div id="notes" className="scroll-mt-20 rounded-[14px] border border-hairline p-4">
            <h3 className="font-display text-[14.5px] font-semibold">Notes</h3>
            <p className="text-[12px] text-slate">Your team sees these. Type @name to tell someone.</p>
            {data.notes.length ? (
              <ul className="mt-2 grid gap-2">
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
            <div className="mt-2 grid gap-2">
              <textarea aria-label="Add a note" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={2} placeholder="Add a note" className={`${areaClass} min-h-0`} />
              <div>
                <Button size="sm" disabled={pending || !noteBody.trim()} onClick={() => run(() => addNote(data.id, noteBody), () => setNoteBody(""))}>
                  Add note
                </Button>
              </div>
            </div>
          </div>

          <div id="history" className="scroll-mt-20 rounded-[14px] border border-hairline p-4">
            <h3 className="font-display text-[14.5px] font-semibold">Before this</h3>
            {data.history.length === 0 ? (
              <p className="mt-1 text-slate">First time they have applied here.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {data.history.map((p) => (
                  <li key={p.id} className="rounded-[10px] bg-mist px-3 py-2">
                    <p>
                      <span className="font-medium">{p.role}</span> · {dateLabel(p.appliedAt)}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-slate">
                      <DecisionBadge decision={p.decision} /> {p.reasonCode ? reasonLabel(p.reasonCode) : ""}
                      {p.decidedBy ? ` · by ${p.decidedBy}` : ""}
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
          </div>
        </div>
      </div>
    </article>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
