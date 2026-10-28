"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { askQuestions, discardDraft, markAskedOutside, sendDrafted, skipVerification } from "@/lib/console/actions/questions";
import { setQuestionSender } from "@/lib/console/actions/roles";
import { Button, Empty, areaClass, fieldClass } from "@/components/console/ui";
import { BandBadge } from "@/components/console/candidate/bits";
import type { Band } from "@/lib/db/schema";

export type Work = {
  id: string;
  name: string;
  rank: number;
  could: number;
  stake: number;
  band: Band | null;
  unverified: { text: string; why: string }[];
  questions: { requirementKey: string | null; text: string }[];
  drafted: { id: string; text: string }[];
  state: string;
  done: boolean;
};

const WORK_SAMPLE = "Could you share a piece of work you are proud of that shows this (a repository, a design document, or a short write-up)?";
const REFERENCE = "Could you put us in touch with someone who worked closely with you on this, such as a former manager or lead?";

export default function VerifyList({ roleId, work, canAsk, sender, orgName }: { roleId: string; work: Work[]; canAsk: boolean; sender: "company" | "winnow"; orgName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string[]>>(Object.fromEntries(work.map((w) => [w.id, w.questions.map((q) => q.text)])));
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<null | "skip" | "outside">(null);
  const [field1, setField1] = useState("");
  const [field2, setField2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const todo = work.filter((w) => !w.done);
  const drafts = work.filter((w) => w.drafted.length);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; sent?: number; failed?: string[] }>, done: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "Something went wrong.");
      else if (r.failed?.length) setMsg(`${done}. Not sent: ${r.failed.join(" ")}`);
      else setMsg(done);
      setMode(null);
      setField1("");
      setField2("");
      router.refresh();
    });

  const draftsFor = (ids: string[], extra?: string) =>
    ids.map((id) => ({ applicationId: id, items: (extra ? [extra] : edits[id] ?? []).filter((t) => t.trim()).map((text) => ({ requirementKey: null, text })) }));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-mist px-4 py-3 text-[13.5px]">
        <p>
          Ordered by how far each person would move if their unverified claims held. <span className="text-slate">{todo.length} to do.</span>
        </p>
        {canAsk ? (
          <label className="flex items-center gap-2">
            <span className="text-slate">Questions come from</span>
            <select
              aria-label="Questions come from"
              defaultValue={sender}
              onChange={(e) => start(() => setQuestionSender(roleId, e.target.value as "company" | "winnow"))}
              className={`${fieldClass} h-8 w-auto`}
            >
              <option value="company">{orgName} (via Winnow)</option>
              <option value="winnow">Winnow</option>
            </select>
          </label>
        ) : null}
      </div>

      {msg ? (
        <p role="status" className="text-[13px] text-slate">
          {msg}
        </p>
      ) : null}

      {canAsk && drafts.length ? (
        <section className="rounded-[14px] border border-signal/30 bg-signal/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              Questions drafted for {drafts.length} candidate{drafts.length === 1 ? "" : "s"}, waiting to be sent
            </p>
            <Button tone="primary" size="sm" disabled={pending} onClick={() => run(() => sendDrafted(drafts.map((d) => d.id)), "Sent")}>
              Approve and send all
            </Button>
          </div>
          <ul className="mt-3 grid gap-1.5 text-[13px]">
            {drafts.map((d) => (
              <li key={d.id}>
                <span className="font-medium">{d.name}:</span>{" "}
                {d.drafted.map((q, i) => (
                  <span key={q.id}>
                    {i ? " · " : ""}
                    {q.text}{" "}
                    <button type="button" className="text-slate hover:text-alert" onClick={() => run(() => discardDraft(q.id), "Removed")} aria-label="Remove this draft">
                      ×
                    </button>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {selected.size && canAsk ? (
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-[12px] border border-hairline bg-paper/95 px-3 py-2 shadow-lift backdrop-blur lg:top-2">
          <span className="text-[13px] font-medium">{selected.size} selected</span>
          <Button size="sm" tone="primary" disabled={pending} onClick={() => run(() => askQuestions(draftsFor([...selected]), true), `Sent questions to ${selected.size}`)}>
            Send each their own questions
          </Button>
          <Button size="sm" tone="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      {work.length === 0 ? (
        <Empty title="Nothing to verify">Nobody&rsquo;s position would change if their unverified claims held.</Empty>
      ) : (
        <ol className="grid gap-3">
          {work.map((w) => (
            <li key={w.id} className={`rounded-[14px] border p-4 ${w.done ? "border-hairline bg-mist/40" : "border-hairline bg-paper"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {canAsk && !w.done ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${w.name}`}
                      checked={selected.has(w.id)}
                      onChange={() => {
                        const n = new Set(selected);
                        if (n.has(w.id)) n.delete(w.id);
                        else n.add(w.id);
                        setSelected(n);
                      }}
                      className="mt-1 size-4 accent-[#1b4dff]"
                    />
                  ) : null}
                  <div>
                    <Link href={`/console/c/${w.id}`} className="font-medium hover:underline">
                      {w.name}
                    </Link>
                    <p className="mt-0.5 text-[12.5px] text-slate">{w.state}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <BandBadge band={w.band} />
                  <p className="font-mono text-[12.5px] tabular-nums">
                    <span className="text-slate">rank</span> {w.rank} <span className="text-slate">could reach</span> {w.could}
                  </p>
                  <p className={`rounded-full px-2 py-0.5 font-mono text-[12px] tabular-nums ${w.stake ? "bg-signal text-paper" : "bg-mist text-slate"}`}>
                    {w.stake} place{w.stake === 1 ? "" : "s"} at stake
                  </p>
                </div>
              </div>

              <ul className="mt-3 grid gap-1 text-[13px]">
                {w.unverified.map((u, i) => (
                  <li key={i}>
                    <span>{u.text}</span> <span className="text-slate">· {u.why}</span>
                  </li>
                ))}
              </ul>

              {canAsk && !w.done ? (
                open === w.id ? (
                  <div className="mt-3 grid gap-2">
                    {(edits[w.id] ?? []).map((t, i) => (
                      <textarea
                        key={i}
                        aria-label={`Question ${i + 1} for ${w.name}`}
                        value={t}
                        rows={2}
                        onChange={(e) => setEdits({ ...edits, [w.id]: edits[w.id].map((x, j) => (j === i ? e.target.value : x)) })}
                        className={`${areaClass} min-h-0`}
                      />
                    ))}
                    {mode === "skip" ? (
                      <div className="flex gap-2">
                        <input value={field1} onChange={(e) => setField1(e.target.value)} placeholder="Why skip?" aria-label="Reason to skip" className={fieldClass} />
                        <Button disabled={pending || !field1.trim()} onClick={() => run(() => skipVerification(w.id, field1), "Skipped")}>
                          Skip
                        </Button>
                      </div>
                    ) : null}
                    {mode === "outside" ? (
                      <div className="grid gap-2">
                        <input value={field1} onChange={(e) => setField1(e.target.value)} placeholder="What was asked" aria-label="What was asked" className={fieldClass} />
                        <textarea value={field2} onChange={(e) => setField2(e.target.value)} placeholder="Their answer, if you have it" aria-label="Their answer" rows={2} className={`${areaClass} min-h-0`} />
                        <div>
                          <Button disabled={pending} onClick={() => run(() => markAskedOutside(w.id, field1, field2), "Recorded")}>
                            Record
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" tone="primary" disabled={pending} onClick={() => run(() => askQuestions(draftsFor([w.id]), true), `Sent to ${w.name}`)}>
                        Send these questions
                      </Button>
                      <Button size="sm" disabled={pending} onClick={() => run(() => askQuestions(draftsFor([w.id], WORK_SAMPLE).map((d) => ({ ...d, kind: "work_sample" as const })), true), "Asked for a work sample")}>
                        Ask for a work sample
                      </Button>
                      <Button size="sm" disabled={pending} onClick={() => run(() => askQuestions(draftsFor([w.id], REFERENCE).map((d) => ({ ...d, kind: "reference" as const })), true), "Asked for a reference")}>
                        Ask for a reference
                      </Button>
                      <Button size="sm" tone="ghost" onClick={() => setMode(mode === "outside" ? null : "outside")}>
                        Asked outside Winnow
                      </Button>
                      <Button size="sm" tone="ghost" onClick={() => setMode(mode === "skip" ? null : "skip")}>
                        Skip with a reason
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    <p className="text-[13px] text-slate">
                      {w.questions.length ? `${w.questions.length} question${w.questions.length === 1 ? "" : "s"} ready: “${w.questions[0].text}”` : "No questions suggested."}
                    </p>
                    <Button size="sm" className="mt-2" onClick={() => setOpen(w.id)}>
                      Review and send
                    </Button>
                  </div>
                )
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
