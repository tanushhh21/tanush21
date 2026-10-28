"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBelief, editBelief, learnFromRoles, refreshInferred, setBeliefActive } from "@/lib/console/actions/brain";
import { Badge, Button, Card, CardHead, areaClass, fieldClass } from "@/components/console/ui";

type Fact = { id: string; group: string; text: string; provenance: "told" | "ats" | "inferred"; confidence: number; evidence: string | null; active: boolean; by: string | null; at: string };

const PROVENANCE = { told: "You told us", ats: "Read in your ATS", inferred: "Inferred" } as const;
const TONE = { told: "ink", ats: "neutral", inferred: "caution" } as const;

export default function Brain({ groups, facts, canEdit }: { groups: { key: string; label: string }[]; facts: Fact[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ?? "Saved") : (r.error ?? "Something went wrong."));
      if (r.ok) {
        setEditing(null);
        setAdding(null);
        setDraft("");
        router.refresh();
      }
    });
  const rejected = facts.filter((f) => !f.active).length;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <>
            <Button tone="primary" disabled={pending} onClick={() => run(learnFromRoles)}>
              {pending ? "Reading…" : "Read our job descriptions"}
            </Button>
            <Button disabled={pending} onClick={() => run(refreshInferred)}>
              Re-check against our decisions
            </Button>
          </>
        ) : null}
        {rejected ? (
          <label className="ml-auto flex items-center gap-2 text-[13px] text-slate">
            <input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} className="size-4 accent-[#1b4dff]" />
            Show {rejected} marked wrong
          </label>
        ) : null}
      </div>
      {msg ? (
        <p role="status" className="rounded-[10px] bg-mist px-3 py-2 text-[13px]">
          {msg}
        </p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((g) => {
          const list = facts.filter((f) => f.group === g.key && (f.active || showRejected));
          return (
            <Card key={g.key}>
              <CardHead
                title={g.label}
                action={
                  canEdit ? (
                    <Button size="sm" tone="ghost" onClick={() => { setAdding(adding === g.key ? null : g.key); setDraft(""); }}>
                      Add
                    </Button>
                  ) : null
                }
              />
              <ul className="divide-y divide-hairline">
                {list.length === 0 && adding !== g.key ? <li className="px-4 py-3 text-[13px] text-slate sm:px-5">Nothing yet.</li> : null}
                {list.map((f) => (
                  <li key={f.id} className={`px-4 py-3 sm:px-5 ${f.active ? "" : "opacity-55"}`}>
                    {editing === f.id ? (
                      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run(() => editBelief(f.id, draft)); }}>
                        <textarea aria-label="Belief" value={draft} onChange={(e) => setDraft(e.target.value)} className={`${areaClass} min-h-16`} autoFocus />
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" tone="primary" disabled={pending || !draft.trim()}>
                            Save
                          </Button>
                          <Button size="sm" tone="ghost" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className={`text-[14px] ${f.active ? "" : "line-through"}`}>{f.text}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate">
                          <Badge tone={TONE[f.provenance]}>{PROVENANCE[f.provenance]}</Badge>
                          <span className="font-mono tabular-nums" title="How sure Winnow is">
                            {Math.round(f.confidence * 100)}% sure
                          </span>
                          {f.by ? <span>· confirmed by {f.by}</span> : null}
                        </p>
                        {f.evidence && f.provenance !== "told" ? <p className="mt-1 text-[12.5px] text-slate">Evidence: {f.evidence}</p> : null}
                        {canEdit ? (
                          <div className="mt-1.5 flex gap-1">
                            <Button size="sm" tone="ghost" onClick={() => { setEditing(f.id); setDraft(f.text); }}>
                              {f.provenance === "inferred" ? "Correct" : "Edit"}
                            </Button>
                            {f.active ? (
                              <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(() => setBeliefActive(f.id, false))}>
                                Not true
                              </Button>
                            ) : (
                              <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(() => setBeliefActive(f.id, true))}>
                                Restore
                              </Button>
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
                {adding === g.key ? (
                  <li className="px-4 py-3 sm:px-5">
                    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addBelief(g.key, draft)); }}>
                      <input aria-label={`New belief: ${g.label}`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Something true about the company" className={`${fieldClass} h-9`} autoFocus />
                      <Button type="submit" size="sm" tone="primary" disabled={pending || !draft.trim()}>
                        Add
                      </Button>
                    </form>
                  </li>
                ) : null}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
