import type { Metadata } from "next";
import Link from "next/link";
import { can, requireCtx } from "@/lib/console/context";
import { summarizeRoles } from "@/lib/console/roles";
import { needsYou } from "@/lib/console/needs";
import { ButtonLink, Empty, PageHeader } from "@/components/console/ui";

export const metadata: Metadata = { title: "Home" };

export default async function Home() {
  const c = await requireCtx();
  const [roles, needs] = await Promise.all([summarizeRoles(c, { includeClosed: true }), needsYou(c)]);

  // First run: one thing on screen.
  if (roles.length === 0) {
    return (
      <div className="flex min-h-[70svh] items-center justify-center">
        <Empty
          title={can.createRole(c) ? "Add your first role" : "No roles yet"}
          action={can.createRole(c) ? <ButtonLink href="/console/roles/new" tone="primary">Add a role</ButtonLink> : null}
        >
          {can.createRole(c)
            ? "Paste a job description, upload one, or describe the role. Winnow builds the rubric and starts ranking."
            : "Roles you are part of will appear here."}
        </Empty>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <PageHeader title={`Good ${greeting()}, ${c.user.name.split(" ")[0]}`} meta={`${needs.length} need${needs.length === 1 ? "s" : ""} you across ${roles.filter((r) => r.state !== "closed").length} open roles`} />
      <ul className="grid gap-2">
        {needs.map((n) => (
          <li key={n.key}>
            <Link href={n.action.href} className="text-signal hover:underline">
              {n.roleTitle}: {n.text}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
