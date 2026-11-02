/**
 * Each person's own Home: which sections show, in what order, which four
 * numbers sit at the top, and how many Needs-you items to preview. Stored on
 * the user as JSON; anything unknown or missing falls back to the default,
 * so a layout saved by an older version never breaks the page.
 */

export const SECTIONS = {
  ask: { label: "Ask Winnow", hint: "The bar for questions and instructions" },
  stats: { label: "Numbers", hint: "Four figures across your open roles" },
  needs: { label: "Needs you", hint: "The most blocking items, with a link to the rest" },
  roles: { label: "Your roles", hint: "Each role's pipeline and status" },
  away: { label: "While you were away", hint: "What happened since your last visit" },
} as const;
export type SectionId = keyof typeof SECTIONS;

export const STATS = {
  openRoles: "Open roles",
  toReview: "Candidates to review",
  shortlisted: "Shortlisted",
  interviewsWeek: "Interviews this week",
  offersOut: "Offers out",
  doToday: "P0 items to do today",
  received: "Applications received",
  behind: "Roles behind target",
} as const;
export type StatId = keyof typeof STATS;

export type HomeLayout = {
  order: SectionId[];
  hidden: SectionId[];
  stats: StatId[];
  needsShown: number;
};

export const MAX_STATS = 4;
export const NEEDS_CHOICES = [3, 4, 6, 10] as const;

export const DEFAULT_LAYOUT: HomeLayout = {
  order: ["ask", "stats", "needs", "roles", "away"],
  hidden: [],
  stats: ["openRoles", "toReview", "interviewsWeek", "offersOut"],
  needsShown: 4,
};

const isSection = (x: unknown): x is SectionId => typeof x === "string" && x in SECTIONS;
const isStat = (x: unknown): x is StatId => typeof x === "string" && x in STATS;

/** Turns whatever is stored (or posted) into a valid layout. */
export function normalizeLayout(raw: unknown): HomeLayout {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof HomeLayout, unknown>>;
  const order = Array.isArray(r.order) ? [...new Set(r.order.filter(isSection))] : [];
  for (const s of DEFAULT_LAYOUT.order) if (!order.includes(s)) order.push(s);
  const hidden = Array.isArray(r.hidden) ? [...new Set(r.hidden.filter(isSection))] : [];
  const stats = Array.isArray(r.stats) ? [...new Set(r.stats.filter(isStat))].slice(0, MAX_STATS) : DEFAULT_LAYOUT.stats;
  const n = Number(r.needsShown);
  return {
    order,
    hidden,
    stats: stats.length ? stats : DEFAULT_LAYOUT.stats,
    needsShown: (NEEDS_CHOICES as readonly number[]).includes(n) ? n : DEFAULT_LAYOUT.needsShown,
  };
}
