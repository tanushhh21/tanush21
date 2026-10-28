import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import { requireUser } from "@/lib/console/context";
import { signOutAction } from "@/lib/console/actions/session";
import { queueCounts } from "@/lib/console/data/operator";
import { buttonClass } from "@/components/console/ui";
import SubNav from "@/components/console/SubNav";

/**
 * Winnow's own surface, across every customer, organised by action rather
 * than by role. Deliberately not part of the customer console.
 */
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.isOperator) redirect("/console");
  const q = await queueCounts();
  const n = (k: string) => (q?.[k] ? ` (${q[k]})` : "");
  return (
    <div className="min-h-svh bg-paper">
      <header className="sticky top-0 z-20 border-b border-hairline bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[76rem] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="flex items-center gap-3">
            <Logo size={18} />
            <span className="rounded-full bg-ink px-2 py-0.5 text-[11.5px] font-medium text-paper">Operator</span>
          </span>
          <span className="flex items-center gap-2">
            <Link href="/console/orgs" className={buttonClass("ghost", "sm")}>
              Open a customer
            </Link>
            <form action={signOutAction}>
              <button type="submit" className={buttonClass("ghost", "sm")}>
                Sign out
              </button>
            </form>
          </span>
        </div>
        <div className="mx-auto max-w-[76rem] px-4 sm:px-6">
          <SubNav
            label="Operator"
            items={[
              { href: "/console/operator/overview", label: "Overview" },
              { href: "/console/operator/searches", label: `Searches${n("searches")}` },
              { href: "/console/operator/triage", label: `Triage${n("triage")}` },
              { href: "/console/operator/outreach", label: `Outreach${n("outreach")}` },
              { href: "/console/operator/replies", label: `Replies${n("replies")}` },
              { href: "/console/operator/parse", label: `Parse failures${n("parse")}` },
              { href: "/console/operator/merges", label: `Merges${n("merges")}` },
            ]}
          />
        </div>
      </header>
      <main className="mx-auto max-w-[76rem] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
