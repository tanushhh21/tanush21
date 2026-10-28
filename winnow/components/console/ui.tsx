/**
 * Console building blocks, in the website's language (see DESIGN.md) but
 * denser: 14px base, 12px radii, hairline borders, one signal accent.
 */
import Link from "next/link";

type Tone = "primary" | "secondary" | "ghost" | "danger";

const buttonTone: Record<Tone, string> = {
  primary: "bg-signal text-paper hover:bg-[#1440e0] shadow-lift",
  secondary: "border border-hairline bg-paper text-ink hover:border-slate/40",
  ghost: "text-slate hover:bg-mist hover:text-ink",
  danger: "border border-hairline bg-paper text-alert hover:border-alert/40",
};

export function buttonClass(tone: Tone = "secondary", size: "sm" | "md" = "md") {
  const s = size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-[13.5px]";
  return `inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 ${s} ${buttonTone[tone]}`;
}

export function Button({
  tone = "secondary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "sm" | "md" }) {
  return <button type="button" {...rest} className={`${buttonClass(tone, size)} ${className}`} />;
}

export function ButtonLink({
  tone = "secondary",
  size = "md",
  className = "",
  ...rest
}: React.ComponentProps<typeof Link> & { tone?: Tone; size?: "sm" | "md" }) {
  return <Link {...rest} className={`${buttonClass(tone, size)} ${className}`} />;
}

export const fieldClass =
  "block h-10 w-full rounded-[10px] border border-hairline bg-paper px-3 text-[16px] text-ink placeholder:text-slate/70 transition-[border-color,box-shadow] duration-150 hover:border-slate/40 focus:border-signal focus:shadow-[0_0_0_3px_rgb(27_77_255/0.14)] focus:outline-none sm:text-[14px]";

export const areaClass = fieldClass.replace("h-10", "min-h-28 py-2.5 leading-relaxed");
/** A compact control that sizes to its content (toolbars). */
export const smallFieldClass = fieldClass.replace("h-10", "h-8").replace("w-full", "w-auto").replace("sm:text-[14px]", "sm:text-[13px]");

export function Field({ label, hint, optional, children }: { label: string; hint?: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink">
        {label}
        {optional ? <span className="font-normal text-slate"> (optional)</span> : null}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {hint ? <span className="mt-1.5 block text-[12.5px] text-slate">{hint}</span> : null}
    </label>
  );
}

type BadgeTone = "neutral" | "signal" | "alert" | "caution" | "ok" | "muted" | "ink";
const badgeTone: Record<BadgeTone, string> = {
  neutral: "border-hairline text-ink",
  signal: "border-signal/30 bg-signal/[0.06] text-signal",
  alert: "border-alert/30 bg-alert/[0.06] text-alert",
  caution: "border-caution/30 bg-caution/[0.06] text-caution",
  ok: "border-ok/30 bg-ok/[0.06] text-ok",
  muted: "border-hairline text-slate",
  ink: "border-ink bg-ink text-paper",
};

export function Badge({ tone = "neutral", className = "", children }: { tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[1px] text-[12px] leading-[18px] ${badgeTone[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-[14px] border border-hairline bg-paper ${className}`}>{children}</section>;
}

export function CardHead({ title, meta, action }: { title: React.ReactNode; meta?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {meta ? <p className="mt-0.5 text-[12.5px] text-slate">{meta}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  meta,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[12.5px] text-slate">{eyebrow}</p> : null}
        <h1 className="font-display text-[clamp(1.375rem,2.4vw,1.75rem)] font-semibold leading-tight tracking-[-0.025em] text-ink">{title}</h1>
        {meta ? <div className="mt-1 text-[13px] text-slate">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="font-display text-[16px] font-semibold text-ink">{title}</p>
      {children ? <div className="mt-1.5 max-w-[30rem] text-[13.5px] text-slate">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** A small filled/outlined dot. Shape carries meaning too, never colour alone. */
export function Dot({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block size-2 shrink-0 rounded-full ${className}`} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-hairline bg-mist px-1 font-mono text-[11px] text-ink">
      {children}
    </kbd>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12.5px] text-slate">{label}</p>
      <p className="mt-0.5 font-mono text-[20px] font-medium tabular-nums tracking-[-0.02em] text-ink">{value}</p>
      {sub ? <p className="text-[12px] text-slate">{sub}</p> : null}
    </div>
  );
}

export const tableClass = "w-full border-collapse text-left text-[13.5px]";
export const thClass = "border-b border-hairline px-3 py-2 text-[12px] font-medium text-slate whitespace-nowrap";
export const tdClass = "border-b border-hairline px-3 py-2.5 align-top";

export function inr(n: number | null | undefined) {
  if (n == null) return "–";
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function ago(d: Date | string | null | undefined) {
  if (!d) return "–";
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function dateLabel(d: Date | string | null | undefined) {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
