import { Segments } from "@/components/console/roles/Tabs";

/** The three ways to look at a role's candidates, with one line on what each is for. */
export function CandidateViews({ roleId, active }: { roleId: string; active: "ranked" | "check" | "everyone" }) {
  const base = `/console/roles/${roleId}`;
  const hint = {
    ranked: "Best match first. People you dropped are hidden.",
    check: "Claims that would move someone up if they hold. Ask the candidate in one click.",
    everyone: "Every application and what happened to it, including people you dropped.",
  }[active];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Segments
        items={[
          { href: base, label: "Ranked", active: active === "ranked" },
          { href: `${base}/verify`, label: "To check", active: active === "check" },
          { href: `${base}/candidates`, label: "Everyone", active: active === "everyone" },
        ]}
      />
      <p className="text-[13px] text-slate">{hint}</p>
    </div>
  );
}

/** Insights: the pool at a glance, or everything that happened. */
export function InsightViews({ roleId, active }: { roleId: string; active: "overview" | "history" }) {
  const base = `/console/roles/${roleId}`;
  return (
    <Segments
      items={[
        { href: `${base}/pool`, label: "Overview", active: active === "overview" },
        { href: `${base}/activity`, label: "History and costs", active: active === "history" },
      ]}
    />
  );
}
