import type { Rubric } from "@/lib/console/data/rubric";
import { Badge } from "@/components/console/ui";

export const ORIGIN: Record<string, { label: string; tone: "neutral" | "signal" | "caution" | "ok" | "muted" }> = {
  jd: { label: "From your job description", tone: "neutral" },
  chat: { label: "You told us in chat", tone: "signal" },
  winnow: { label: "Winnow added it", tone: "caution" },
  fitted: { label: "Fitted from your decisions", tone: "ok" },
  manual: { label: "Entered by hand", tone: "muted" },
};

export function Weight({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`Weight ${value} of 5`} title={`Weight ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`size-[7px] rounded-full ${i <= value ? "bg-ink" : "bg-hairline"}`} />
      ))}
    </span>
  );
}

/** The rubric as read-only rows: what we screen on, and where each line came from. */
export default function RubricList({ rubric }: { rubric: Rubric }) {
  return (
    <div className="grid gap-6">
      <ol className="grid gap-3">
        {rubric.requirements.map((q) => (
          <li key={q.id} className="rounded-[12px] border border-hairline bg-paper p-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <p className="min-w-0 flex-1 text-[14px] font-medium text-ink">{q.text}</p>
              <div className="flex items-center gap-2">
                {q.mustHave ? <Badge tone="ink">Must-have</Badge> : null}
                <Weight value={q.weight} />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
              <Badge tone={ORIGIN[q.origin]?.tone ?? "neutral"}>{ORIGIN[q.origin]?.label ?? q.origin}</Badge>
              {q.minYears ? <Badge tone="muted">{q.minYears}+ years</Badge> : null}
              {q.recencySensitive ? <Badge tone="muted">Recent experience</Badge> : null}
              {q.keywords.length ? <span className="text-slate">Also counts: {q.keywords.join(", ")}</span> : null}
            </div>
            {q.sourceSentence ? (
              <p className={`mt-2.5 border-l-2 pl-3 text-[13px] leading-snug ${q.origin === "winnow" ? "border-caution/40 text-slate" : "border-hairline text-slate"}`}>
                {q.origin === "jd" ? <>&ldquo;{q.sourceSentence}&rdquo;</> : q.sourceSentence}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      {rubric.refused.length ? (
        <section>
          <h3 className="font-display text-[14px] font-semibold">Not encoded ({rubric.refused.length})</h3>
          <p className="mt-0.5 text-[12.5px] text-slate">Lines from the job description Winnow would not score on, and why.</p>
          <ul className="mt-3 grid gap-2">
            {rubric.refused.map((r) => (
              <li key={r.id} className="rounded-[12px] bg-mist px-4 py-3 text-[13px]">
                <p className="text-ink line-through decoration-slate/50">&ldquo;{r.line}&rdquo;</p>
                <p className="mt-1 text-slate">
                  <Badge tone={r.kind === "protected" ? "alert" : "caution"} className="mr-1.5">
                    {r.kind === "protected" ? "Protected" : "Unwise"}
                  </Badge>
                  {r.reason}
                  {r.addedAnyway ? <span className="ml-1 text-caution">Added anyway, with a bias flag.</span> : null}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
