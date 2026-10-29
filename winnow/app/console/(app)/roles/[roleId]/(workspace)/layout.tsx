import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, users } from "@/lib/db/schema";
import { can, daysSince, requireCtx, requireRole } from "@/lib/console/context";
import { Badge, buttonClass, dateLabel, inr } from "@/components/console/ui";
import Tabs from "@/components/console/roles/Tabs";
import Uploader from "@/components/console/roles/Uploader";

/** Role workspace: header (what the role is and where its candidates stand) and four tabs, shared by every role screen. */
export default async function Workspace({ children, params }: { children: React.ReactNode; params: Promise<{ roleId: string }> }) {
  const c = await requireCtx();
  const role = await requireRole(c, (await params).roleId);
  const [manager] = role.hiringManagerId ? await db.select({ name: users.name }).from(users).where(eq(users.id, role.hiringManagerId)) : [];
  const [counts] = await db
    .select({
      total: sql<number>`count(*) filter (where coalesce(${applications.reasonCode}, '') <> 'duplicate')::int`,
      review: sql<number>`count(*) filter (where ${applications.decision} = 'none' and ${applications.parseStatus} = 'parsed')::int`,
      shortlisted: sql<number>`count(*) filter (where ${applications.stage} = 'shortlisted')::int`,
      interviewing: sql<number>`count(*) filter (where ${applications.stage} = 'interviewing')::int`,
      offer: sql<number>`count(*) filter (where ${applications.stage} = 'offer')::int`,
      hired: sql<number>`count(*) filter (where ${applications.stage} = 'hired')::int`,
      unreadable: sql<number>`count(*) filter (where ${applications.parseStatus} = 'unreadable')::int`,
    })
    .from(applications)
    .where(eq(applications.roleId, role.id));
  const base = `/console/roles/${role.id}`;

  const meta = [
    role.locations.join(", ") || null,
    manager?.name ? `Hiring manager ${manager.name}` : null,
    `${role.openings} opening${role.openings === 1 ? "" : "s"}`,
    role.compMin || role.compMax ? `${inr(role.compMin)}–${inr(role.compMax)}` : null,
    role.state === "open" ? `Open ${daysSince(role.createdAt)} day${daysSince(role.createdAt) === 1 ? "" : "s"}` : null,
    role.targetDate && role.state === "open" ? `Target ${dateLabel(role.targetDate)}` : null,
  ].filter(Boolean);
  const pipeline = [
    { n: counts.total, label: counts.total === 1 ? "candidate" : "candidates", href: `${base}/candidates` },
    { n: counts.review, label: "to review", href: base },
    { n: counts.shortlisted, label: "shortlisted", href: `${base}?view=shortlisted` },
    { n: counts.interviewing, label: "interviewing", href: `${base}/interviews` },
    { n: counts.offer, label: counts.offer === 1 ? "offer out" : "offers out", href: `${base}/interviews` },
    { n: counts.hired, label: "hired", href: `${base}/interviews` },
  ].filter((x, i) => i < 2 || x.n > 0);

  return (
    <div className="grid gap-5">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(1.375rem,2.4vw,1.75rem)] font-semibold leading-tight tracking-[-0.025em]">
              {role.title}
              {role.state !== "open" ? <Badge tone="muted" className="ml-2 align-middle">{role.state === "closed" ? "Closed" : "On hold"}</Badge> : null}
            </h1>
            <p className="mt-1 text-[13px] text-slate">{meta.join(" · ")}</p>
          </div>
          <div className="flex items-center gap-2">
            {can.manageSources(c) && role.state === "open" ? <Uploader roleId={role.id} compact /> : null}
            <Link href={`/console/chat?role=${role.id}`} className={buttonClass("secondary", "sm")}>
              Ask AI
            </Link>
            <Link href={`${base}/settings`} className={buttonClass("ghost", "sm")}>
              <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden="true">
                <path d="M3.75 6.25h6.5M13.75 6.25h2.5M3.75 13.75h2.5M9.75 13.75h6.5M12 4.25v4M8 11.75v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Settings
            </Link>
          </div>
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
          {pipeline.map((x) => (
            <Link key={x.label} href={x.href} className="text-slate hover:text-ink">
              <span className="font-semibold text-ink tabular-nums">{x.n}</span> {x.label}
            </Link>
          ))}
          {counts.unreadable ? (
            <Link href={`${base}/candidates`} className="text-alert hover:underline">
              {counts.unreadable} could not be read
            </Link>
          ) : null}
        </p>
        <Tabs roleId={role.id} counts={{}} />
      </header>
      {children}
    </div>
  );
}
