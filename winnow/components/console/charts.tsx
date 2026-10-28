"use client";

/**
 * Small charts in the Winnow style (see the dataviz rules): one hue for
 * magnitude (signal), bars no thicker than 24px with 4px rounded data ends,
 * 2px gaps, hairline axes, a hover/focus tooltip on every mark, and a table
 * view for every chart so no value is hover-only.
 */
import { useState } from "react";

type Datum = { label: string; value: number; note?: string; muted?: boolean };

/** Named formats, so server components can pick one (functions cannot cross to the client). */
export type Fmt = "int" | "rupees" | "lakh" | "days" | "pct" | "dec1";
const FORMATS: Record<Fmt, (n: number) => string> = {
  int: (n) => Math.round(n).toLocaleString("en-IN"),
  rupees: (n) => `₹${n < 100 ? n.toFixed(1) : Math.round(n).toLocaleString("en-IN")}`,
  lakh: (n) => `₹${(n / 100000).toFixed(1)}L`,
  days: (n) => `${Math.round(n)}d`,
  pct: (n) => `${Math.round(n)}%`,
  dec1: (n) => n.toFixed(1),
};
const format = (f: Fmt | ((n: number) => string) | undefined) => (typeof f === "function" ? f : FORMATS[f ?? "int"]);

function Tip({ text, x, y }: { text: string; x: number; y: number }) {
  return (
    <span role="tooltip" className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[8px] bg-ink px-2 py-1 text-[12px] text-paper shadow-lift" style={{ left: x, top: y - 6 }}>
      {text}
    </span>
  );
}

function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="text-[12px] text-slate hover:text-ink">
      {open ? "Show chart" : "Show as table"}
    </button>
  );
}

function DataTable({ data, head, fmt }: { data: Datum[]; head: [string, string]; fmt: (n: number) => string }) {
  return (
    <table className="w-full text-left text-[13px]">
      <thead>
        <tr className="text-[12px] text-slate">
          <th className="py-1 font-medium">{head[0]}</th>
          <th className="py-1 text-right font-medium">{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.label} className="border-t border-hairline">
            <td className="py-1.5">{d.label}</td>
            <td className="py-1.5 text-right font-mono tabular-nums">
              {fmt(d.value)}
              {d.note ? <span className="ml-2 font-sans text-slate">{d.note}</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Horizontal bars: a label, a bar, the value at the tip. */
export function BarList({ data, max, fmt: f, head = ["", "Value"], unit = "" }: { data: Datum[]; max?: number; fmt?: Fmt | ((n: number) => string); head?: [string, string]; unit?: string }) {
  const fmt = format(f);
  const [table, setTable] = useState(false);
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      {table ? (
        <DataTable data={data} head={head} fmt={fmt} />
      ) : (
        <ul className="grid gap-2">
          {data.map((d) => (
            <li key={d.label} tabIndex={0} aria-label={`${d.label}: ${fmt(d.value)}${unit}${d.note ? `, ${d.note}` : ""}`} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-3 rounded-[6px] outline-offset-2 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
              <span className="min-w-0">
                <span className={`block truncate text-[13px] ${d.muted ? "text-slate" : "text-ink"}`} title={d.label}>
                  {d.label}
                </span>
                {d.note ? <span className="block truncate text-[11.5px] text-slate">{d.note}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <span className="h-[14px] flex-1">
                  <span
                    className={`block h-full rounded-r-[4px] transition-opacity hover:opacity-80 ${d.muted ? "bg-slate/35" : "bg-signal"}`}
                    style={{ width: `${Math.max(d.value > 0 ? 1.5 : 0, (100 * d.value) / top)}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-ink">
                  {fmt(d.value)}
                  {unit}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 text-right">
        <TableToggle open={table} onToggle={() => setTable(!table)} />
      </div>
    </div>
  );
}

/**
 * Columns over buckets, with an optional highlighted range (e.g. your
 * compensation band) drawn behind them as a quiet wash.
 */
export function Columns({
  data,
  highlight,
  fmt: f,
  head = ["Bucket", "Count"],
  height = 140,
}: {
  data: Datum[];
  highlight?: { from: number; to: number; label: string };
  fmt?: Fmt | ((n: number) => string);
  head?: [string, string];
  height?: number;
}) {
  const fmt = format(f);
  const [table, setTable] = useState(false);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const top = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  return (
    <div>
      {table ? (
        <DataTable data={data} head={head} fmt={fmt} />
      ) : (
        <div className="relative" onPointerLeave={() => setTip(null)}>
          <div className="relative flex items-end gap-[2px] border-b border-hairline" style={{ height }}>
            {highlight ? (
              <span aria-hidden="true" className="absolute inset-y-0 rounded-[4px] bg-signal/[0.07]" style={{ left: `${(100 * highlight.from) / n}%`, width: `${(100 * (highlight.to - highlight.from)) / n}%` }}>
                <span className="absolute left-1.5 top-1 text-[11px] text-slate">{highlight.label}</span>
              </span>
            ) : null}
            {data.map((d, i) => (
              <span key={d.label} className="relative flex h-full flex-1 items-end justify-center">
                <span
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.label}: ${fmt(d.value)}`}
                  onPointerEnter={(e) => {
                    const r = (e.currentTarget.parentElement!.parentElement!.parentElement as HTMLElement).getBoundingClientRect();
                    const b = e.currentTarget.getBoundingClientRect();
                    setTip({ text: `${fmt(d.value)} · ${d.label}`, x: b.left - r.left + b.width / 2, y: b.top - r.top });
                  }}
                  onFocus={(e) => {
                    const r = (e.currentTarget.parentElement!.parentElement!.parentElement as HTMLElement).getBoundingClientRect();
                    const b = e.currentTarget.getBoundingClientRect();
                    setTip({ text: `${fmt(d.value)} · ${d.label}`, x: b.left - r.left + b.width / 2, y: b.top - r.top });
                  }}
                  onBlur={() => setTip(null)}
                  className={`relative w-full max-w-[24px] rounded-t-[4px] outline-offset-2 transition-opacity hover:opacity-80 ${d.muted ? "bg-slate/35" : "bg-signal"}`}
                  style={{ height: `${d.value ? Math.max(2, (100 * d.value) / top) : 0}%` }}
                />
              </span>
            ))}
          </div>
          <div className="mt-1.5 flex gap-[2px] text-[11px] text-slate">
            {data.map((d, i) => (
              <span key={d.label} className="flex-1 truncate text-center">
                {i % Math.ceil(n / 6) === 0 ? d.label : ""}
              </span>
            ))}
          </div>
          {tip ? <Tip {...tip} /> : null}
        </div>
      )}
      <div className="mt-2 text-right">
        <TableToggle open={table} onToggle={() => setTable(!table)} />
      </div>
    </div>
  );
}

/** A funnel as horizontal bars with the conversion from the step before. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const data = steps.map((s, i) => ({
    label: s.label,
    value: s.value,
    note: i === 0 ? undefined : steps[i - 1].value ? `${Math.round((100 * s.value) / steps[i - 1].value)}% of the step before` : "–",
  }));
  return <BarList data={data} head={["Stage", "People"]} />;
}
