import type { Band, VerdictValue } from "@/lib/db/schema";
import { Badge } from "@/components/console/ui";

const VERDICT: Record<VerdictValue, { label: string; cls: string }> = {
  met: { label: "Met", cls: "bg-signal border-signal" },
  partial: { label: "Partly", cls: "border-signal [background:linear-gradient(90deg,var(--color-signal)_50%,transparent_50%)]" },
  not_met: { label: "Not met", cls: "border-alert bg-paper" },
  unknown: { label: "Unknown", cls: "border-dashed border-slate/60 bg-paper" },
};

/** A verdict as a shape plus a word: filled, half, crossed, dashed. */
export function VerdictMark({ v, withLabel = false }: { v: VerdictValue; withLabel?: boolean }) {
  const meta = VERDICT[v];
  return (
    <span className="inline-flex items-center gap-1.5" title={meta.label}>
      <span aria-hidden="true" className={`relative inline-block size-[11px] shrink-0 rounded-full border-[1.5px] ${meta.cls}`}>
        {v === "not_met" ? <span className="absolute inset-0 m-auto h-[1.5px] w-[7px] rotate-45 bg-alert" /> : null}
      </span>
      <span className={withLabel ? "text-[12.5px]" : "sr-only"}>{meta.label}</span>
    </span>
  );
}

const BAND_TITLE: Record<Band, string> = {
  verified: "Every must-have is shown in the CV and nothing contradicts it",
  needs_verification: "Some claims need checking before you can rely on the score",
  below_bar: "Missing a must-have, or well below on what the CV shows",
};

export function BandBadge({ band }: { band: Band | null }) {
  if (!band) return null;
  const label = band === "verified" ? "Evidence clear" : band === "needs_verification" ? "Check claims" : "Below the bar";
  return (
    <span title={BAND_TITLE[band]}>
      <Badge tone={band === "verified" ? "ok" : band === "needs_verification" ? "caution" : "muted"}>{label}</Badge>
    </span>
  );
}

export function DecisionBadge({ decision, stage }: { decision: string; stage?: string }) {
  if (decision === "shortlisted") {
    if (stage === "hired") return <Badge tone="ok">Hired</Badge>;
    if (stage === "offer") return <Badge tone="signal">Offer out</Badge>;
    if (stage === "interviewing") return <Badge tone="signal">Interviewing</Badge>;
    return <Badge tone="ink">Shortlisted</Badge>;
  }
  if (decision === "dropped") return <Badge tone="muted">Dropped</Badge>;
  if (decision === "held") return <Badge tone="caution">On hold</Badge>;
  return null;
}

export function Evidence({ value }: { value: "strong" | "moderate" | "weak" | null }) {
  if (!value) return <span className="text-slate">–</span>;
  const n = value === "strong" ? 3 : value === "moderate" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5" title={`${value} evidence`}>
      <span className="flex items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-[3px] rounded-[1px] ${i <= n ? "bg-ink" : "bg-hairline"}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      <span className="text-[12.5px] capitalize text-slate">{value}</span>
    </span>
  );
}
