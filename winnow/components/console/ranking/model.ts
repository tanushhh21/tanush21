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

export const BAND_LABEL: Record<Band, string> = { verified: "Verified", needs_verification: "Needs verification", below_bar: "Below the bar" };
export const VERDICT_LABEL: Record<VerdictValue, string> = { met: "Met", partial: "Partly", not_met: "Not met", unknown: "Unknown" };
export const DECISION_LABEL: Record<string, string> = { none: "Undecided", shortlisted: "Shortlisted", dropped: "Dropped", held: "Held" };

export type ColumnId = string;

export const DEFAULT_COLUMNS: ColumnId[] = ["rank", "name", "reason", "must", "evidence", "source", "percentile", "score", "band"];

export const META_COLUMNS: { id: ColumnId; label: string }[] = [
  { id: "rank", label: "Rank" },
  { id: "name", label: "Name" },
  { id: "reason", label: "Why" },
  { id: "must", label: "Must-haves" },
  { id: "evidence", label: "Evidence" },
  { id: "source", label: "Source" },
  { id: "percentile", label: "Percentile" },
  { id: "score", label: "Score" },
  { id: "band", label: "Band" },
  { id: "confidence", label: "Confidence" },
  { id: "applied", label: "Applied" },
  { id: "stage_days", label: "Days at stage" },
  { id: "decision", label: "Decision" },
  { id: "reason_code", label: "Reason code" },
  { id: "decided_by", label: "Decided by" },
  { id: "decided_at", label: "Decided at" },
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
      return row.score != null ? String(row.score) : "";
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
      return row.reasonCode ?? "";
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
      return `reason: ${f.values.join(" or ")}`;
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
      return row.score ?? -1;
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
