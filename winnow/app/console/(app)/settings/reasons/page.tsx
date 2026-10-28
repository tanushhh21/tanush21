import type { Metadata } from "next";
import { eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { reasonCodes } from "@/lib/db/schema";
import { can, requireCtx } from "@/lib/console/context";
import { addReasonCode, toggleReasonCode } from "@/lib/console/actions/settings";
import { Badge, Card, CardHead, Field, buttonClass, fieldClass } from "@/components/console/ui";
import Saved from "@/components/console/Saved";

export const metadata: Metadata = { title: "Reason codes" };

const APPLIES = { drop: "Dropping", hold: "Holding", shortlist: "Shortlisting", any: "Any decision" } as const;

export default async function Reasons({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const c = await requireCtx();
  const saved = (await searchParams).saved;
  const admin = can.orgSettings(c);
  const rows = await db.select().from(reasonCodes).where(or(isNull(reasonCodes.orgId), eq(reasonCodes.orgId, c.org.id)));
  const groups = (["drop", "hold", "shortlist"] as const).map((a) => ({ a, list: rows.filter((r) => r.applies === a || r.applies === "any") }));
  return (
    <div className="grid gap-5">
      <Saved code={saved} messages={{ added: "Added. It shows in every decision from now on.", saved: "Saved.", missing: "Give the reason a name." }} problems={["missing"]} />
      <p className="text-[13.5px] text-slate">
        Every decision needs a reason from this closed list, which is what makes Analytics able to say why candidates were turned down. Winnow&rsquo;s reasons are always available; add your own where they do not fit.
      </p>
      {admin ? (
        <Card>
          <CardHead title="Add a reason" />
          <form action={addReasonCode} className="flex flex-wrap items-end gap-3 px-4 py-4 sm:px-5">
            <Field label="Reason">
              <input name="label" required placeholder="e.g. Failed the take-home" className={`${fieldClass} sm:w-72`} />
            </Field>
            <Field label="Used when">
              <select name="applies" className={`${fieldClass} sm:w-44`}>
                <option value="drop">Dropping</option>
                <option value="hold">Holding</option>
                <option value="shortlist">Shortlisting</option>
              </select>
            </Field>
            <button type="submit" className={buttonClass("primary")}>
              Add
            </button>
          </form>
        </Card>
      ) : null}
      {groups.map((g) => (
        <Card key={g.a}>
          <CardHead title={APPLIES[g.a]} />
          <ul className="divide-y divide-hairline">
            {g.list.map((r) => (
              <li key={r.id} className={`flex items-center justify-between gap-2 px-4 py-2.5 text-[13.5px] sm:px-5 ${r.active ? "" : "text-slate"}`}>
                <span>
                  {r.label}
                  {r.orgId ? <Badge tone="neutral" className="ml-2">{c.org.name}</Badge> : null}
                  {!r.active ? <Badge tone="muted" className="ml-2">Retired</Badge> : null}
                </span>
                {admin && r.orgId ? (
                  <form action={toggleReasonCode}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className={buttonClass("ghost", "sm")}>
                      {r.active ? "Retire" : "Restore"}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
