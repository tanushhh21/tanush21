/**
 * Console building blocks. The website's colours (see DESIGN.md) in a work
 * tool's shape, after Linear, Attio and Ashby: Inter at 13.5px, 6–10px radii,
 * flat hairline surfaces, one signal accent, one primary action per screen.
 */
import Link from "next/link";

type Tone = "primary" | "secondary" | "ghost" | "danger";

const buttonTone: Record<Tone, string> = {
  primary: "bg-signal text-paper hover:bg-[#1440e0]",
  secondary: "border border-hairline bg-paper text-ink shadow-[0_1px_1px_rgb(10_12_15/0.04)] hover:bg-mist",
  ghost: "text-slate hover:bg-mist hover:text-ink",
  danger: "border border-hairline bg-paper text-alert hover:border-alert/40",
};

export function buttonClass(tone: Tone = "secondary", size: "sm" | "md" = "md") {
  const s = size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]";
  return `inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 ${s} ${buttonTone[tone]}`;
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
  "block h-9 w-full rounded-[6px] border border-hairline bg-paper px-2.5 text-[16px] text-ink placeholder:text-slate/70 transition-[border-color,box-shadow] duration-150 hover:border-slate/40 focus:border-signal focus:shadow-[0_0_0_3px_rgb(27_77_255/0.12)] focus:outline-none sm:text-[13.5px]";

export const areaClass = fieldClass.replace("h-9", "min-h-28 py-2 leading-relaxed");
/** A compact control that sizes to its content (toolbars). */
export const smallFieldClass = fieldClass.replace("h-9", "h-8").replace("w-full", "w-auto").replace("sm:text-[13.5px]", "sm:text-[13px]");

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
  neutral: "bg-ink/[0.05] text-ink",
  signal: "bg-signal/[0.08] text-[#1a3fc4]",
  alert: "bg-alert/[0.08] text-alert",
  caution: "bg-caution/[0.09] text-caution",
  ok: "bg-ok/[0.08] text-ok",
  muted: "bg-ink/[0.04] text-slate",
  ink: "bg-ink/[0.07] text-ink",
};

const badgeDot: Record<BadgeTone, string> = {
  neutral: "",
  muted: "",
  signal: "bg-signal",
  alert: "bg-alert",
  caution: "bg-caution",
  ok: "bg-ok",
  ink: "bg-ink",
};

export function Badge({ tone = "neutral", className = "", children }: { tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[5px] px-1.5 py-[1px] text-[12px] font-medium leading-[18px] ${badgeTone[tone]} ${className}`}>
      {tone !== "neutral" && tone !== "muted" ? <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${badgeDot[tone]}`} /> : null}
      {children}
    </span>
  );
}

export function Card({ className = "", id, children }: { className?: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-20 rounded-[8px] border border-hairline bg-paper ${className}`}>
      {children}
    </section>
  );
}

export function CardHead({ title, meta, action }: { title: React.ReactNode; meta?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-2.5">
      <div className="min-w-0">
        <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
        {meta ? <p className="mt-0.5 text-[12px] text-slate">{meta}</p> : null}
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
        {eyebrow ? <p className="mb-0.5 text-[12px] text-slate">{eyebrow}</p> : null}
        <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.018em] text-ink">{title}</h1>
        {meta ? <div className="mt-1 text-[12.5px] text-slate">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A section's own heading inside Settings (the page title is already "Settings"). */
export function SettingsHead({ title, meta, actions }: { title: string; meta?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-[44rem]">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {meta ? <p className="mt-1 text-[13px] text-slate">{meta}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="text-[14px] font-semibold text-ink">{title}</p>
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
      <p className="mt-0.5 text-[20px] font-semibold tabular-nums tracking-[-0.02em] text-ink">{value}</p>
      {sub ? <p className="text-[12px] text-slate">{sub}</p> : null}
    </div>
  );
}

export const tableClass = "w-full border-collapse text-left text-[13px]";
export const thClass = "h-8 border-b border-hairline bg-mist/60 px-3 text-[12px] font-medium text-slate whitespace-nowrap";
export const tdClass = "border-b border-hairline px-3 py-2 align-top";

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
