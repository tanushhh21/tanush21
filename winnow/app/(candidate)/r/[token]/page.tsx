import type { Metadata } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, orgs, persons, questions, roles } from "@/lib/db/schema";
import { submitReply } from "@/lib/console/actions/reply";

export const metadata: Metadata = { title: "Your application", robots: { index: false, follow: false } };

export default async function Reply({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; empty?: string }> }) {
  const { token } = await params;
  const q = await searchParams;
  const rows = /^[\w-]{10,64}$/.test(token)
    ? await db
        .select({ q: questions, role: roles.title, org: orgs.name, name: persons.name })
        .from(questions)
        .innerJoin(applications, eq(applications.id, questions.applicationId))
        .innerJoin(roles, eq(roles.id, applications.roleId))
        .innerJoin(orgs, eq(orgs.id, roles.orgId))
        .innerJoin(persons, eq(persons.id, applications.personId))
        .where(and(eq(questions.token, token), inArray(questions.status, ["sent", "unanswered", "answered"])))
    : [];
  if (rows.length === 0) {
    return <p className="text-[15px]">This link is not valid. If you received it by email, reply to that email instead.</p>;
  }
  const open = rows.filter((r) => r.q.status !== "answered");
  const { role, org, name } = rows[0];
  if (q.done || open.length === 0) {
    return (
      <div>
        <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em]">Thank you, {name.split(" ")[0]}.</h1>
        <p className="mt-2 text-[15px] text-slate">Your answers have reached {org}. They will be in touch about {role}.</p>
      </div>
    );
  }
  return (
    <form action={submitReply} className="grid gap-6">
      <input type="hidden" name="token" value={token} />
      <div>
        <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em]">A few questions about {role}</h1>
        <p className="mt-2 text-[15px] text-slate">
          Hi {name.split(" ")[0]}, {org} would like to understand a little more. A few sentences each is plenty.
        </p>
      </div>
      {q.empty ? <p className="rounded-[10px] bg-[#b42318]/[0.06] px-3 py-2.5 text-[14px] text-[#b42318]">Answer at least one question, or tick the box below.</p> : null}
      {open.map((r, i) => (
        <label key={r.q.id} className="block">
          <span className="text-[15px] font-medium">
            {i + 1}. {r.q.text}
          </span>
          <textarea
            name={`a_${r.q.id}`}
            rows={4}
            className="mt-2 block w-full rounded-[12px] border border-[#e8eaed] bg-paper px-3.5 py-3 text-[16px] leading-relaxed focus:border-[#1b4dff] focus:outline-none focus:shadow-[0_0_0_3px_rgb(27_77_255/0.14)]"
          />
        </label>
      ))}
      <label className="flex items-center gap-2.5 text-[14px] text-slate">
        <input type="checkbox" name="notInterested" className="size-4 accent-[#1b4dff]" />
        I am no longer interested in this role
      </label>
      <div>
        <button type="submit" className="rounded-full bg-[#1b4dff] px-5 py-3 text-[15px] font-medium text-paper shadow-[0_1px_2px_rgb(10_12_15/0.06)] hover:bg-[#1440e0]">
          Send my answers
        </button>
      </div>
      <p className="text-[12.5px] text-slate">Your answers go only to {org} and Winnow, the service they use for hiring.</p>
    </form>
  );
}
