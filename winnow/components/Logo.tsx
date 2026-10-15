import { markSlots } from "@/lib/field";

/**
 * The Winnow mark: ten dots narrowing to one. Nine in ink, one in signal:
 * the shortlist, and the hire. The same ten dots the hero ends on.
 */
const S = 10;
const R = 3.3;
const DOTS = markSlots(0, 0, S);
const minX = -1.5 * S - R;
const minY = -1.5 * S * 0.866 - R;
const VB = `${minX} ${minY} ${3 * S + 2 * R} ${3 * S * 0.866 + 2 * R}`;

export function Mark({ className = "", title }: { className?: string; title?: string }) {
  return (
    <svg viewBox={VB} className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      {DOTS.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={R} fill={i === DOTS.length - 1 ? "var(--color-signal)" : "currentColor"} />
      ))}
    </svg>
  );
}

/** Mark and wordmark together. */
export default function Logo({ className = "", size = 20 }: { className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center gap-[0.42em] text-ink ${className}`} style={{ fontSize: size }}>
      <Mark className="h-[0.86em] w-auto translate-y-[0.04em]" />
      <span className="font-wordmark text-[1em] font-bold leading-none tracking-[-0.03em]">winnow</span>
    </span>
  );
}
