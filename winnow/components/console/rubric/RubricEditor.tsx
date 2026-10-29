"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRubric, addFilter, toggleFilter, deleteFilter, restoreVersion } from "@/lib/console/actions/rubric";
import { arithmetic } from "@/lib/console/arith";
import type { ReqOrigin, VerdictValue } from "@/lib/db/schema";
import { Badge, Button, areaClass, fieldClass, smallFieldClass } from "@/components/console/ui";
import { ORIGIN, Weight } from "@/components/console/roles/RubricList";

type Item = {
  key: string;
  text: string;
  weight: number;
  mustHave: boolean;
  keywords: string[];
  minYears: number | null;
  recencySensitive: boolean;
  origin: ReqOrigin;
  sourceSentence: string | null;
};
type Refused = { id: string; line: string; reason: string; kind: "protected" | "unwise"; addedAnyway: boolean };
type FilterRow = { id: string; label: string; active: boolean; excludes: number; aboveTop: number };
type Version = { version: number; summary: string; origin: string; by: string | null; at: string; entered: string[]; left: string[]; requirements: { text: string; weight: number; mustHave: boolean }[] };
type Cand = { id: string; name: string; verdicts: Record<string, VerdictValue> };

const FIELDS: [string, string][] = [
  ["notice_period_days", "Notice period (days)"],
  ["expected_ctc", "Expected CTC (₹ lakh)"],
  ["years_experience", "Years of experience"],
  ["city", "City"],
  ["willing_to_relocate", "Willing to relocate"],
];

export default function RubricEditor(p: { roleId: string; items: Item[]; refused: Refused[]; filters: FilterRow[]; versions: Version[]; candidates: Cand[]; canEdit: boolean; top: number }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(p.items);
  const [anyway, setAnyway] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [newFilter, setNewFilter] = useState({ field: "notice_period_days", op: "lte", value: "" });
  const [openVersion, setOpenVersion] = useState<number | null>(null);
  const dirty = JSON.stringify(items) !== JSON.stringify(p.items) || anyway.length > 0;

  // Live effect of the draft, by arithmetic on what is already known.
  const effect = useMemo(() => {
    if (!dirty) return null;
    const rank = (reqs: Item[]) =>
      p.candidates
        .map((c) => ({ id: c.id, name: c.name, s: arithmetic(reqs, Object.entries(c.verdicts).map(([requirementKey, verdict]) => ({ requirementKey, verdict, support: null }))).standing }))
        .sort((a, b) => b.s - a.s);
    const before = rank(p.items);
    const after = rank(items);
    const topBefore = new Set(before.slice(0, p.top).map((x) => x.id));
    const topAfter = new Set(after.slice(0, p.top).map((x) => x.id));
    const reread = items.filter((q) => {
      const o = p.items.find((x) => x.key === q.key);
      return !o || o.text !== q.text || o.keywords.join() !== q.keywords.join() || o.minYears !== q.minYears || o.recencySensitive !== q.recencySensitive;
    }).length;
    return {
      moved: after.filter((x, i) => before.findIndex((y) => y.id === x.id) !== i).length,
      entered: after.filter((x) => topAfter.has(x.id) && !topBefore.has(x.id)).map((x) => x.name),
      left: before.filter((x) => topBefore.has(x.id) && !topAfter.has(x.id)).map((x) => x.name),
      reread,
    };
  }, [items, dirty, p.items, p.candidates, p.top]);

  const set = (i: number, patch: Partial<Item>) => setItems(items.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) => {
    const n = [...items];
    const [x] = n.splice(i, 1);
    n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x);
    setItems(n);
  };
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ?? ok ?? "Saved") : (r.error ?? "Something went wrong."));
      if (r.ok) {
        setAnyway([]);
        setSummary("");
        router.refresh();
      }
    });

  return (
    <div className="grid gap-8">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-[16px] font-semibold">What candidates are scored on</h2>
            <p className="text-[12.5px] text-slate">More dots means it counts for more. Saving a change re-scores everyone; earlier versions are kept.</p>
          </div>
          {p.canEdit ? (
            <Button
              size="sm"
              onClick={() => setItems([...items, { key: `new-${Date.now()}`, text: "", weight: 3, mustHave: false, keywords: [], minYears: null, recencySensitive: false, origin: "manual", sourceSentence: null }])}
            >
              Add a requirement
            </Button>
          ) : null}
        </div>
        <ol className="mt-4 grid gap-3">
          {items.map((q, i) => (
            <li key={q.key} className="rounded-[12px] border border-hairline bg-paper p-3.5">
              {p.canEdit ? (
                <div className="grid gap-2.5">
                  <div className="flex items-start gap-2">
                    <textarea aria-label={`Requirement ${i + 1}`} value={q.text} rows={1} onChange={(e) => set(i, { text: e.target.value })} className={`${areaClass} min-h-10 flex-1 py-2`} placeholder="What must the person have done or be able to do?" />
                    <div className="flex flex-col">
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded px-1.5 text-slate hover:text-ink disabled:opacity-30">
                        ↑
                      </button>
                      <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="rounded px-1.5 text-slate hover:text-ink disabled:opacity-30">
                        ↓
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                    <label className="flex items-center gap-2">
                      <span className="text-slate">Weight</span>
                      <input type="range" min={1} max={5} value={q.weight} onChange={(e) => set(i, { weight: Number(e.target.value) })} aria-label="Weight" className="w-24 accent-[#0a0c0f]" />
                      <Weight value={q.weight} />
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={q.mustHave} onChange={(e) => set(i, { mustHave: e.target.checked })} className="size-4 accent-[#1b4dff]" />
                      Must-have
                    </label>
                    <label className="flex items-center gap-1.5">
                      <span className="text-slate">Min. years</span>
                      <input value={q.minYears ?? ""} inputMode="numeric" onChange={(e) => set(i, { minYears: e.target.value ? Number(e.target.value.replace(/\D/g, "")) || null : null })} aria-label="Minimum years" className={`${smallFieldClass} w-14`} />
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={q.recencySensitive} onChange={(e) => set(i, { recencySensitive: e.target.checked })} className="size-4 accent-[#1b4dff]" />
                      Recent experience only
                    </label>
                    <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="ml-auto text-slate hover:text-alert">
                      Remove
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-[13px]">
                    <span className="shrink-0 text-slate">Also look for</span>
                    <input value={q.keywords.join(", ")} onChange={(e) => set(i, { keywords: e.target.value.split(",").map((s) => s.trimStart()) })} aria-label="Related keywords" className={`${smallFieldClass} w-full`} placeholder="Keywords that also satisfy it, comma separated" />
                  </label>
                  <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate">
                    <Badge tone={ORIGIN[q.origin]?.tone ?? "neutral"}>{ORIGIN[q.origin]?.label}</Badge>
                    {q.sourceSentence ? <span className="line-clamp-1">&ldquo;{q.sourceSentence}&rdquo;</span> : null}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{q.text}</p>
                    <div className="flex items-center gap-2">
                      {q.mustHave ? <Badge tone="ink">Must-have</Badge> : null}
                      <Weight value={q.weight} />
                    </div>
                  </div>
                  <p className="mt-1.5 text-[12px]">
                    <Badge tone={ORIGIN[q.origin]?.tone ?? "neutral"}>{ORIGIN[q.origin]?.label}</Badge>
                  </p>
                </div>
              )}
            </li>
          ))}
        </ol>

        {p.canEdit && dirty ? (
          <div className="sticky bottom-3 z-20 mt-4 grid gap-2 rounded-[14px] border border-ink/10 bg-paper p-4 shadow-lift-hover">
            {effect ? (
              <p className="text-[13px]">
                <span className="font-medium">If saved: </span>
                {effect.moved} candidate{effect.moved === 1 ? "" : "s"} change place
                {effect.entered.length ? `; into the top ${p.top}: ${effect.entered.join(", ")}` : ""}
                {effect.left.length ? `; out of it: ${effect.left.join(", ")}` : ""}.
                {effect.reread ? <span className="text-slate"> {effect.reread} new or reworded requirement{effect.reread === 1 ? "" : "s"} will be re-read for everyone; their effect shows once that is done.</span> : null}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What changed (optional)" aria-label="What changed" className={`${fieldClass} h-9 flex-1`} />
              <Button tone="primary" disabled={pending || items.some((q) => !q.text.trim())} onClick={() => run(() => saveRubric(p.roleId, items.map((q) => ({ ...q, key: q.key.startsWith("new-") ? null : q.key, keywords: q.keywords.map((k) => k.trim()).filter(Boolean) })), summary, anyway))}>
                Save as new version
              </Button>
              <Button tone="ghost" onClick={() => { setItems(p.items); setAnyway([]); }}>
                Discard
              </Button>
            </div>
          </div>
        ) : null}
        {msg ? <p role="status" className="mt-3 text-[13px] text-slate">{msg}</p> : null}
      </section>

      <section>
        <h2 className="font-display text-[16px] font-semibold">Left out on purpose</h2>
        <p className="text-[12.5px] text-slate">Lines from the job description Winnow does not score, and why.</p>
        {p.refused.length === 0 ? <p className="mt-3 text-[13px] text-slate">Nothing was refused.</p> : null}
        <ul className="mt-3 grid gap-2">
          {p.refused.map((r) => {
            const ask = r.reason.split("Ask instead: ")[1];
            return (
              <li key={r.id} className="rounded-[12px] bg-mist px-4 py-3 text-[13px]">
                <p className="text-ink">&ldquo;{r.line}&rdquo;</p>
                <p className="mt-1 text-slate">
                  <Badge tone={r.kind === "protected" ? "alert" : "caution"} className="mr-1.5">
                    {r.kind === "protected" ? "Protected" : "Unwise"}
                  </Badge>
                  {r.reason}
                </p>
                {p.canEdit ? (
                  r.kind === "protected" ? (
                    ask ? (
                      <button
                        type="button"
                        className="mt-2 text-signal hover:underline"
                        onClick={() => setItems([...items, { key: `new-${Date.now()}`, text: ask.replace(/\?$/, ""), weight: 3, mustHave: false, keywords: [], minYears: null, recencySensitive: false, origin: "manual", sourceSentence: `Instead of: ${r.line}` }])}
                      >
                        Ask about the underlying requirement instead
                      </button>
                    ) : null
                  ) : r.addedAnyway || anyway.includes(r.id) ? (
                    <p className="mt-2 text-caution">Added anyway, with a bias flag. This is recorded on the role.</p>
                  ) : (
                    <button
                      type="button"
                      className="mt-2 text-signal hover:underline"
                      onClick={() => {
                        setAnyway([...anyway, r.id]);
                        setItems([...items, { key: `new-${Date.now()}`, text: r.line, weight: 2, mustHave: false, keywords: [], minYears: null, recencySensitive: false, origin: "manual", sourceSentence: "Added anyway, against advice (bias flag)" }]);
                      }}
                    >
                      Add it anyway (see the effect before saving)
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-[16px] font-semibold">Filters that remove people</h2>
        <p className="text-[12.5px] text-slate">A filter takes people out of the ranking entirely, for example a notice period over 60 days. Someone whose CV does not say is never removed.</p>
        <ul className="mt-3 grid gap-2">
          {p.filters.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-hairline px-4 py-2.5 text-[13px]">
              <span>
                <span className={f.active ? "font-medium" : "text-slate"}>{f.label}</span>
                <span className="text-slate">
                  {" "}
                  · {f.active ? "removes" : "would remove"} {f.excludes}
                  {f.aboveTop ? <span className="text-caution">, {f.aboveTop} of them scoring above the current top {p.top}</span> : ""}
                </span>
                {!f.active ? <Badge tone="muted" className="ml-2">Suggested, off</Badge> : null}
              </span>
              {p.canEdit ? (
                <span className="flex gap-2">
                  <Button size="sm" disabled={pending} onClick={() => run(() => toggleFilter(f.id, !f.active), f.active ? "Filter off" : "Filter on")}>
                    {f.active ? "Turn off" : "Turn on"}
                  </Button>
                  <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(() => deleteFilter(f.id), "Removed")}>
                    Remove
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {p.canEdit ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
            <select aria-label="Field" value={newFilter.field} onChange={(e) => setNewFilter({ ...newFilter, field: e.target.value })} className={smallFieldClass}>
              {FIELDS.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select aria-label="Condition" value={newFilter.op} onChange={(e) => setNewFilter({ ...newFilter, op: e.target.value })} className={smallFieldClass}>
              <option value="lte">at most</option>
              <option value="gte">at least</option>
              <option value="in">is one of</option>
              <option value="eq">is</option>
            </select>
            <input value={newFilter.value} onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })} aria-label="Value" placeholder="value" className={`${smallFieldClass} w-36`} />
            <Button size="sm" disabled={pending || !newFilter.value.trim()} onClick={() => run(() => addFilter(p.roleId, newFilter.field, newFilter.op, newFilter.value), "Filter added")}>
              Add filter
            </Button>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="font-display text-[16px] font-semibold">Earlier versions</h2>
        <ol className="mt-3 grid gap-2">
          {p.versions.map((v, i) => (
            <li key={v.version} className="rounded-[12px] border border-hairline px-4 py-3 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  <span className="font-mono font-medium">v{v.version}</span> {v.summary}
                  <span className="text-slate">
                    {" "}
                    · {v.by ?? "Winnow"} · {new Date(v.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    {v.origin === "chat" ? " · from chat" : v.origin === "restore" ? " · restore" : ""}
                  </span>
                </p>
                <span className="flex gap-2">
                  <Button size="sm" tone="ghost" onClick={() => setOpenVersion(openVersion === v.version ? null : v.version)}>
                    {openVersion === v.version ? "Hide" : "View"}
                  </Button>
                  {p.canEdit && i > 0 ? (
                    <Button size="sm" disabled={pending} onClick={() => run(() => restoreVersion(p.roleId, v.version), `Restored v${v.version}`)}>
                      Restore
                    </Button>
                  ) : null}
                </span>
              </div>
              {v.entered.length || v.left.length ? (
                <p className="mt-1 text-slate">
                  {v.entered.length ? `Into the top 10: ${v.entered.join(", ")}. ` : ""}
                  {v.left.length ? `Out: ${v.left.join(", ")}.` : ""}
                </p>
              ) : null}
              {openVersion === v.version ? (
                <ul className="mt-2 grid gap-1 border-t border-hairline pt-2">
                  {v.requirements.map((q, j) => (
                    <li key={j} className="flex items-center justify-between gap-3">
                      <span>{q.text}</span>
                      <span className="flex items-center gap-2">
                        {q.mustHave ? <Badge tone="ink">Must-have</Badge> : null}
                        <Weight value={q.weight} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
