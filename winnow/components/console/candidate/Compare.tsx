"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Candidate } from "@/lib/console/data/candidate";
import type { Reason } from "@/lib/console/data/ranking";
import { calibrate, decide } from "@/lib/console/actions/candidates";
import { askQuestions } from "@/lib/console/actions/questions";
import { Button, areaClass, fieldClass } from "@/components/console/ui";
import { BandBadge, VerdictMark } from "./bits";

/** Two to five candidates side by side; differences emphasised. */
export default function Compare({ roleId, people, reasons, canAsk }: { roleId: string; people: Candidate[]; reasons: Reason[]; canAsk: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [first, setFirst] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [dropReason, setDropReason] = useState(reasons.find((r) => r.code === "someone_else")?.code ?? reasons.find((r) => r.applies === "drop")?.code ?? "");
  const reqs = people[0]?.rubric ?? [];
  const differs = (key: string) => new Set(people.map((p) => p.rubric.find((r) => r.key === key)?.verdict)).size > 1;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? done : r.error ?? "Something went wrong.");
      if (r.ok) router.refresh();
    });

  return (
    <div className="grid gap-5">
      <div className="rounded-[12px] bg-mist px-4 py-3 text-[13.5px]">
        <p className="font-medium">Which would you interview first?</p>
        <p className="mt-0.5 text-[12.5px] text-slate">Your answer moves the weights for this role. No form, just the decision you were making anyway.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {people.map((p) => (
            <Button
              key={p.id}
              size="sm"
              tone={first === p.id ? "primary" : "secondary"}
              disabled={pending}
              onClick={() => {
                setFirst(p.id);
                run(() => calibrate(roleId, p.id, people.filter((x) => x.id !== p.id).map((x) => x.id)), `Noted: ${p.person.name} first.`);
              }}
            >
              {p.person.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-hairline">
        <table className="w-full min-w-[40rem] border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="bg-mist/60">
              <th className="w-[30%] px-3 py-2.5 text-[12px] font-medium text-slate">Requirement</th>
              {people.map((p) => (
                <th key={p.id} className="px-3 py-2.5 align-top">
                  <p className="font-medium">{p.person.name}</p>
                  <p className="mt-0.5 font-mono text-[12px] tabular-nums text-slate">
                    Rank {p.header.rank ?? "–"} · {p.header.score ?? "–"}
                  </p>
                  <div className="mt-1">
                    <BandBadge band={p.header.band} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reqs.map((q) => {
              const diff = differs(q.key);
              return (
                <tr key={q.key} className={`border-t border-hairline align-top ${diff ? "bg-signal/[0.03]" : ""}`}>
                  <td className="px-3 py-2.5">
                    <p className={diff ? "font-medium" : "text-slate"}>{q.text}</p>
                    <p className="text-[11.5px] text-slate">
                      weight {q.weight}
                      {q.mustHave ? " · must-have" : ""}
                      {diff ? " · differs" : ""}
                    </p>
                  </td>
                  {people.map((p) => {
                    const v = p.rubric.find((r) => r.key === q.key)!;
                    return (
                      <td key={p.id} className="px-3 py-2.5">
                        <VerdictMark v={v.verdict} withLabel />
                        {v.quote && diff ? <p className="mt-1 line-clamp-3 text-[12.5px] text-ink/75">&ldquo;{v.quote}&rdquo;</p> : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {(["expected_ctc", "notice_period_days", "city"] as const).map((field) => (
              <tr key={field} className="border-t border-hairline">
                <td className="px-3 py-2.5 text-slate">{{ expected_ctc: "Expected CTC", notice_period_days: "Notice period", city: "City" }[field]}</td>
                {people.map((p) => (
                  <td key={p.id} className="px-3 py-2.5">
                    {p.facts.find((f) => f.field === field)?.value ?? <span className="text-slate">–</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {msg ? <p role="status" className="text-[13px] text-slate">{msg}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[12px] border border-hairline p-4">
          <p className="font-medium">Shortlist one, drop the others</p>
          <div className="mt-2 grid gap-2">
            <select aria-label="Shortlist" value={first ?? ""} onChange={(e) => setFirst(e.target.value)} className={fieldClass}>
              <option value="">Choose who to shortlist</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.person.name}
                </option>
              ))}
            </select>
            <select aria-label="Reason for the others" value={dropReason} onChange={(e) => setDropReason(e.target.value)} className={fieldClass}>
              {reasons
                .filter((r) => r.applies === "drop")
                .map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
            </select>
            <Button
              tone="primary"
              disabled={pending || !first}
              onClick={() =>
                run(async () => {
                  const a = await decide({ ids: [first!], decision: "shortlisted", reasonCode: reasons.find((r) => r.applies === "shortlist")?.code ?? "strong_match" });
                  if (!a.ok) return a;
                  return decide({ ids: people.filter((p) => p.id !== first).map((p) => p.id), decision: "dropped", reasonCode: dropReason });
                }, "Done.")
              }
            >
              Confirm
            </Button>
          </div>
        </div>
        {canAsk ? (
          <div className="rounded-[12px] border border-hairline p-4">
            <p className="font-medium">Send all of them the same question</p>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} aria-label="Question" className={`${areaClass} mt-2 min-h-0`} />
            <Button
              className="mt-2"
              disabled={pending || !question.trim()}
              onClick={() => run(() => askQuestions(people.map((p) => ({ applicationId: p.id, items: [{ requirementKey: null, text: question }] })), true), "Sent.")}
            >
              Send
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
