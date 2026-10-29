/**
 * The Ranking list's vocabulary: columns, filters, sorting and export, shared
 * by the Ranking and Candidates screens. Pure functions, no React.
 */
import type { Row } from "@/lib/console/data/ranking";
import type { Band, VerdictValue } from "@/lib/db/schema";

export type Req = { key: string; text: string; weight: number; mustHave: boolean };

export const FACT_LABEL: Record<string, string> = {
  institution: "Institution",
  degree: "Degree",
  graduation_year: "Year",
  current_company: "Current company",
  current_title: "Current title",
  years_experience: "Years of experience",
  city: "City",
  willing_to_relocate: "Willing to relocate",
  current_ctc: "Current CTC",
  expected_ctc: "Expected CTC",
  notice_period_days: "Notice period",
  languages: "Languages",
  age: "Age",
};

export const SOURCE_LABEL: Record<string, string> = {
  upload: "Uploaded",
  referral: "Referral",
  ats: "ATS",
  careers_inbox: "Careers inbox",
  winnow_sourcing: "Sourced",
  talent_pool: "Talent pool",
};

/** Plain words for the bands: is the evidence clear, are there claims to check, or is it below the bar. */
export const BAND_LABEL: Record<Band, string> = { verified: "Evidence clear", needs_verification: "Check claims", below_bar: "Below the bar" };
export const VERDICT_LABEL: Record<VerdictValue, string> = { met: "Met", partial: "Partly", not_met: "Not met", unknown: "Unknown" };
export const DECISION_LABEL: Record<string, string> = { none: "Undecided", shortlisted: "Shortlisted", dropped: "Dropped", held: "On hold" };

/** Winnow's own reasons, in words; a company's own codes fall back to their code made readable. */
export const REASON_LABEL: Record<string, string> = {
  below_bar: "Below the bar",
  missing_must_have: "Missing a must-have",
  comp_misaligned: "Pay expectations too high",
  notice_too_long: "Notice period too long",
  location: "Location",
  not_interested: "Not interested",
  no_response: "No response",
  failed_verification: "A claim did not hold up",
  interview_feedback: "Interview feedback",
  someone_else: "Chose someone else",
  duplicate: "Duplicate application",
  role_closed: "Role closed",
  other: "Other",
  timing: "Timing",
  comparing: "Comparing with others",
  awaiting_answer: "Waiting on an answer",
  strong_match: "Strong match",
  worth_a_conversation: "Worth a conversation",
};
export const reasonLabel = (code: string | null) => (code ? REASON_LABEL[code] ?? code.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "");

/**
 * The number the list is ordered by: the score, tempered by how much of the
 * role the CV covers, so a thin CV cannot outrank a full one. Shown as Match.
 */
export const matchOf = (r: { score: number | null; confidence: number | null }) => (r.score == null ? null : Math.round(r.score * (0.6 + 0.4 * (r.confidence ?? 0))));

/** Where someone stands, in one word: their stage once decided, otherwise what the evidence says. */
export function statusOf(r: Pick<Row, "decision" | "stage" | "band" | "status">): { label: string; tone: "ink" | "signal" | "ok" | "caution" | "muted" } {
  if (r.decision === "dropped") return { label: "Dropped", tone: "muted" };
  if (r.decision === "held") return { label: "On hold", tone: "caution" };
  if (r.decision === "shortlisted") {
    if (r.stage === "hired") return { label: "Hired", tone: "ok" };
    if (r.stage === "offer") return { label: "Offer out", tone: "signal" };
    if (r.stage === "interviewing") return { label: "Interviewing", tone: "signal" };
    return { label: "Shortlisted", tone: "ink" };
  }
  if (r.band === "verified") return { label: BAND_LABEL.verified, tone: "ok" };
  if (r.band === "needs_verification") return { label: BAND_LABEL.needs_verification, tone: "caution" };
  if (r.band === "below_bar") return { label: BAND_LABEL.below_bar, tone: "muted" };
  return { label: r.status === "done" ? "Undecided" : "Not scored yet", tone: "muted" };
}

export type ColumnId = string;

export const DEFAULT_COLUMNS: ColumnId[] = ["rank", "name", "reason", "must", "score", "status"];
export const EVERYONE_COLUMNS: ColumnId[] = ["name", "status", "reason_code", "decided_by", "decided_at", "score", "source"];

export const META_COLUMNS: { id: ColumnId; label: string }[] = [
  { id: "rank", label: "#" },
  { id: "name", label: "Candidate" },
  { id: "reason", label: "Why" },
  { id: "must", label: "Must-haves" },
  { id: "score", label: "Match" },
  { id: "status", label: "Status" },
  { id: "evidence", label: "Evidence" },
  { id: "source", label: "Source" },
  { id: "confidence", label: "How much the CV covers" },
  { id: "percentile", label: "Percentile" },
  { id: "applied", label: "Applied" },
  { id: "stage_days", label: "Days at this stage" },
  { id: "decision", label: "Decision" },
  { id: "reason_code", label: "Reason" },
  { id: "decided_by", label: "Decided by" },
  { id: "decided_at", label: "Decided on" },
  { id: "contradictions", label: "Contradictions" },
];

export function columnLabel(id: ColumnId, reqs: Req[]) {
  if (id.startsWith("req:")) return reqs.find((r) => `req:${r.key}` === id)?.text ?? "Requirement";
  if (id.startsWith("fact:")) return FACT_LABEL[id.slice(5)] ?? id.slice(5);
  return META_COLUMNS.find((m) => m.id === id)?.label ?? id;
}

export const inrShort = (n: number | null | undefined) => (n == null ? "" : n >= 100000 ? `₹${Math.round(n / 10000) / 10}L` : `₹${n.toLocaleString("en-IN")}`);

/** A cell as plain text: for export and for the stated/inferred title. */
export function cellText(row: Row, id: ColumnId, reqs: Req[]): string {
  if (id.startsWith("req:")) return VERDICT_LABEL[row.verdicts[id.slice(4)] ?? "unknown"];
  if (id.startsWith("fact:")) {
    const f = row.facts[id.slice(5)];
    if (!f) return "";
    const v = id.endsWith("ctc") && f.n != null ? inrShort(f.n) : id.endsWith("notice_period_days") && f.n != null ? `${f.n} days` : f.v;
    return f.s ? v : `${v} (inferred)`;
  }
  switch (id) {
    case "rank":
      return row.rank ? String(row.rank) : "";
    case "name":
      return row.name;
    case "reason":
      return [row.strength, row.gap].filter(Boolean).join(" / ");
    case "must":
      return row.mustTotal ? `${row.mustMet}/${row.mustTotal}` : "";
    case "evidence":
      return row.evidence ?? "";
    case "source":
      return SOURCE_LABEL[row.source] ?? row.source;
    case "percentile":
      return row.percentile != null ? String(row.percentile) : "";
    case "score":
      return matchOf(row) != null ? String(matchOf(row)) : "";
    case "status":
      return statusOf(row).label;
    case "band":
      return row.band ? BAND_LABEL[row.band] : row.status;
    case "confidence":
      return row.confidence != null ? `${Math.round(row.confidence * 100)}%` : "";
    case "applied":
      return row.appliedAt.slice(0, 10);
    case "stage_days":
      return String(row.stageDays);
    case "decision":
      return DECISION_LABEL[row.decision] ?? row.decision;
    case "reason_code":
      return reasonLabel(row.reasonCode);
    case "decided_by":
      return row.decidedBy ?? "";
    case "decided_at":
      return row.decidedAt ? row.decidedAt.slice(0, 10) : "";
    case "contradictions":
      return row.contradictions ? String(row.contradictions) : "";
  }
  return "";
}

// ---- Filters ---------------------------------------------------------------

export type Filter =
  | { t: "req"; key: string; states: VerdictValue[] }
  | { t: "score"; min?: number; max?: number }
  | { t: "confidence"; min?: number; max?: number }
  | { t: "band"; values: Band[] }
  | { t: "source"; values: string[] }
  | { t: "flag"; value: "contradiction" | "unseen" }
  | { t: "decision"; values: string[] }
  | { t: "reason"; values: string[] }
  | { t: "fact"; field: string; op: "contains" | "lte" | "gte" | "known" | "unknown"; value?: string }
  | { t: "musthaves"; value: "all" | "missing" };

export function matches(row: Row, f: Filter, reqs: Req[]): boolean {
  switch (f.t) {
    case "req":
      return f.states.includes(row.verdicts[f.key] ?? "unknown");
    case "score":
      return row.score != null && (f.min == null || row.score >= f.min) && (f.max == null || row.score <= f.max);
    case "confidence": {
      const c = row.confidence == null ? null : row.confidence * 100;
      return c != null && (f.min == null || c >= f.min) && (f.max == null || c <= f.max);
    }
    case "band":
      return row.band != null && f.values.includes(row.band);
    case "source":
      return f.values.includes(row.source);
    case "flag":
      return f.value === "contradiction" ? row.contradictions > 0 : row.decision === "shortlisted" && !row.managerSeen;
    case "decision":
      return f.values.includes(row.decision);
    case "reason":
      return row.reasonCode != null && f.values.includes(row.reasonCode);
    case "musthaves": {
      const must = reqs.filter((r) => r.mustHave);
      const allMet = must.every((r) => row.verdicts[r.key] === "met");
      return f.value === "all" ? allMet : !allMet;
    }
    case "fact": {
      const fact = row.facts[f.field];
      if (f.op === "known") return Boolean(fact);
      if (f.op === "unknown") return !fact;
      if (!fact) return false;
      if (f.op === "contains") return fact.v.toLowerCase().includes((f.value ?? "").toLowerCase());
      const limit = Number(String(f.value ?? "").replace(/[^\d.]/g, ""));
      const n = fact.n;
      if (n == null || Number.isNaN(limit)) return false;
      const scaled = f.field.endsWith("ctc") && limit < 1000 ? limit * 100000 : limit;
      return f.op === "lte" ? n <= scaled : n >= scaled;
    }
  }
}

export function describeFilter(f: Filter, reqs: Req[]): string {
  const req = (k: string) => reqs.find((r) => r.key === k)?.text ?? "a requirement";
  switch (f.t) {
    case "req":
      return `${f.states.map((s) => VERDICT_LABEL[s].toLowerCase()).join(" or ")} on ${req(f.key)}`;
    case "score":
      return f.min != null && f.max != null ? `score ${f.min}–${f.max}` : f.min != null ? `score ≥ ${f.min}` : `score ≤ ${f.max}`;
    case "confidence":
      return f.min != null ? `confidence ≥ ${f.min}%` : `confidence ≤ ${f.max}%`;
    case "band":
      return f.values.map((b) => BAND_LABEL[b]).join(" or ");
    case "source":
      return `from ${f.values.map((s) => SOURCE_LABEL[s] ?? s).join(" or ")}`;
    case "flag":
      return f.value === "contradiction" ? "has a contradiction" : "shortlisted, not yet seen by the manager";
    case "decision":
      return f.values.map((d) => DECISION_LABEL[d]?.toLowerCase() ?? d).join(" or ");
    case "reason":
      return `reason: ${f.values.map((v) => reasonLabel(v)).join(" or ")}`;
    case "musthaves":
      return f.value === "all" ? "all must-haves met" : "missing a must-have";
    case "fact":
      return `${FACT_LABEL[f.field] ?? f.field} ${f.op === "known" ? "is known" : f.op === "unknown" ? "is unknown" : f.op === "contains" ? `contains "${f.value}"` : f.op === "lte" ? `≤ ${f.value}` : `≥ ${f.value}`}`;
  }
}

// ---- Sorting -------------------------------------------------------------------

export type Sort = { key: string; dir: "asc" | "desc" };

const VERDICT_ORDER: Record<VerdictValue, number> = { met: 3, partial: 2, unknown: 1, not_met: 0 };

export function sortValue(row: Row, key: string): number | string {
  if (key.startsWith("req:")) return VERDICT_ORDER[row.verdicts[key.slice(4)] ?? "unknown"];
  if (key.startsWith("fact:")) {
    const f = row.facts[key.slice(5)];
    return f?.n ?? f?.v?.toLowerCase() ?? "";
  }
  switch (key) {
    case "rank":
      return row.rank ?? 1e9;
    case "score":
      return matchOf(row) ?? -1;
    case "confidence":
      return row.confidence ?? -1;
    case "percentile":
      return row.percentile ?? -1;
    case "name":
      return row.name.toLowerCase();
    case "applied":
      return row.appliedAt;
    case "stage_days":
      return row.stageDays;
    case "must":
      return row.mustMet ?? -1;
    case "contradictions":
      return row.contradictions;
    default:
      return cellText(row, key, []).toLowerCase();
  }
}

export function sortRows(rows: Row[], s: Sort) {
  const dir = s.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, s.key);
    const y = sortValue(b, s.key);
    if (x === y) return (a.rank ?? 1e9) - (b.rank ?? 1e9);
    return (x > y ? 1 : -1) * dir;
  });
}

// ---- Export ---------------------------------------------------------------------

export function toCsv(rows: Row[], columns: ColumnId[], reqs: Req[]) {
  // A leading = + - @ would run as a formula in a spreadsheet.
  const esc = (raw: string) => {
    const v = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const head = columns.map((c) => esc(columnLabel(c, reqs)));
  return [head.join(","), ...rows.map((r) => columns.map((c) => esc(cellText(r, c, reqs))).join(","))].join("\n");
}

export function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
