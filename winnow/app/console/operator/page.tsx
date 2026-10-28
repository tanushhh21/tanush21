import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, sql } from "drizzle-orm";
import Logo from "@/components/Logo";
import { db } from "@/lib/db";
import { orgs, roles } from "@/lib/db/schema";
import { requireUser } from "@/lib/console/context";
import { createOrg, signOutAction } from "@/lib/console/actions/session";
import { Field, buttonClass, fieldClass } from "@/components/console/ui";

export const metadata: Metadata = { title: "Operator" };

/** Winnow's own surface. For now: customers, and setting up a new one. */
export default async function Operator() {
  const user = await requireUser();
  if (!user.isOperator) redirect("/console");
  const list = await db
    .select({ id: orgs.id, name: orgs.name, open: sql<number>`(select count(*)::int from ${roles} where ${roles.orgId} = ${orgs.id} and ${roles.state} = 'open')` })
    .from(orgs)
    .orderBy(asc(orgs.name));
  return (
    <main className="mx-auto max-w-[44rem] px-5 py-10">
      <div className="flex items-center justify-between">
        <Logo size={20} />
        <form action={signOutAction}>
          <button type="submit" className={buttonClass("ghost", "sm")}>
            Sign out
          </button>
        </form>
      </div>
      <h1 className="mt-10 font-display text-[24px] font-semibold tracking-[-0.025em]">Operator console</h1>
      <p className="mt-1 text-[13.5px] text-slate">Every customer, and the work that runs across them.</p>

      <section className="mt-8">
        <h2 className="font-display text-[15px] font-semibold">Customers</h2>
        {list.length === 0 ? <p className="mt-2 text-[13.5px] text-slate">No customers yet.</p> : null}
        <ul className="mt-3 grid gap-2">
          {list.map((o) => (
            <li key={o.id} className="flex items-center justify-between rounded-[12px] border border-hairline px-4 py-3">
              <span className="font-medium">{o.name}</span>
              <span className="text-[12.5px] text-slate">{o.open} open roles</span>
            </li>
          ))}
        </ul>
        {list.length ? (
          <a href="/console/orgs" className={`${buttonClass("secondary")} mt-3`}>
            Open a customer
          </a>
        ) : null}
      </section>

      <section className="mt-10 rounded-[14px] border border-hairline p-5">
        <h2 className="font-display text-[15px] font-semibold">New customer</h2>
        <form action={createOrg} className="mt-4 grid gap-4">
          <Field label="Company name">
            <input name="name" required className={fieldClass} />
          </Field>
          <Field label="Email domain" optional hint="Used to suggest teammates, e.g. acme.in">
            <input name="domain" className={fieldClass} />
          </Field>
          <Field label="First admin's email" optional hint="They get an invite by email.">
            <input name="adminEmail" type="email" className={fieldClass} />
          </Field>
          <div>
            <button type="submit" className={buttonClass("primary")}>
              Create customer
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
