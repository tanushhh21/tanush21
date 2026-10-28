import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, availabilityLinks, interviews, orgs, persons, roles } from "@/lib/db/schema";
import { bookSlot } from "@/lib/console/actions/booking";
import { ist } from "@/lib/console/ics";

export const metadata: Metadata = { title: "Pick a time", robots: { index: false, follow: false } };

export default async function PickTime({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; gone?: string }> }) {
  const { token } = await params;
  const q = await searchParams;
  const [row] = /^[\w-]{10,64}$/.test(token)
    ? await db
        .select({ link: availabilityLinks, role: roles.title, org: orgs.name, name: persons.name })
        .from(availabilityLinks)
        .innerJoin(applications, eq(applications.id, availabilityLinks.applicationId))
        .innerJoin(roles, eq(roles.id, availabilityLinks.roleId))
        .innerJoin(orgs, eq(orgs.id, roles.orgId))
        .innerJoin(persons, eq(persons.id, applications.personId))
        .where(eq(availabilityLinks.token, token))
    : [];
  if (!row) return <p className="text-[15px]">This link is not valid. Reply to the email it came in instead.</p>;
  if (row.link.status === "booked" || q.done) {
    const [iv] = await db.select().from(interviews).where(eq(interviews.linkId, row.link.id));
    return (
      <div>
        <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em]">You&rsquo;re booked, {row.name.split(" ")[0]}.</h1>
        <p className="mt-2 text-[15px] text-slate">
          {iv ? `${ist(iv.startAt)}, India time. ` : ""}The calendar invite is in your inbox, and we will remind you the day before.
        </p>
      </div>
    );
  }
  const open = row.link.slots.map((s, i) => ({ ...s, i })).filter((s) => new Date(s.start).getTime() > Date.now());
  return (
    <form action={bookSlot} className="grid gap-6">
      <input type="hidden" name="token" value={token} />
      <div>
        <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em]">Pick a time for your interview</h1>
        <p className="mt-2 text-[15px] text-slate">
          {row.org}, {row.role}. {row.link.minutes} minutes. Times are in India time.
        </p>
      </div>
      {q.gone ? <p className="rounded-[10px] bg-[#b42318]/[0.06] px-3 py-2.5 text-[14px] text-[#b42318]">That time has passed. Pick another.</p> : null}
      {open.length === 0 ? (
        <p className="text-[15px]">All of these times have passed. Reply to the email and we will send new ones.</p>
      ) : (
        <fieldset className="grid gap-2">
          <legend className="sr-only">Times</legend>
          {open.map((s, k) => (
            <label key={s.i} className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[#e8eaed] bg-paper px-4 py-3.5 text-[16px] has-[:checked]:border-[#1b4dff] has-[:checked]:shadow-[0_0_0_3px_rgb(27_77_255/0.14)]">
              <input type="radio" name="slot" value={s.i} required defaultChecked={k === 0} className="size-4 accent-[#1b4dff]" />
              {ist(s.start)}
            </label>
          ))}
        </fieldset>
      )}
      {open.length ? (
        <div>
          <button type="submit" className="rounded-full bg-[#1b4dff] px-5 py-3 text-[15px] font-medium text-paper shadow-[0_1px_2px_rgb(10_12_15/0.06)] hover:bg-[#1440e0]">
            Confirm this time
          </button>
        </div>
      ) : null}
    </form>
  );
}
