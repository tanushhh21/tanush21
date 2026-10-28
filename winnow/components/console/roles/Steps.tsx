import Link from "next/link";

export const STEPS = ["The role", "Basics", "Rubric", "Candidates", "Who sees it"];

/** The create-a-role steps. Every step after the first can be skipped. */
export default function Steps({ current, roleId }: { current: number; roleId?: string }) {
  return (
    <ol className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px]" aria-label="Steps">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const state = n === current ? "current" : n < current ? "done" : "todo";
        const label = (
          <span className="flex items-center gap-2">
            <span
              className={`flex size-5 items-center justify-center rounded-full font-mono text-[11px] tabular-nums ${
                state === "current" ? "bg-ink text-paper" : state === "done" ? "bg-signal/10 text-signal" : "border border-hairline text-slate"
              }`}
            >
              {n}
            </span>
            <span className={state === "current" ? "font-medium text-ink" : "text-slate"}>{s}</span>
          </span>
        );
        return (
          <li key={s} aria-current={state === "current" ? "step" : undefined}>
            {roleId && n > 1 ? <Link href={`/console/roles/${roleId}/setup?step=${n}`}>{label}</Link> : label}
          </li>
        );
      })}
    </ol>
  );
}
