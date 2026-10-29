"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bookDirect, markInterview, markJoined, remindDebrief, saveDebrief, sendAvailability, setStage } from "@/lib/console/actions/interviews";
import { Badge, Button, Card, CardHead, Empty, Field, areaClass, fieldClass, smallFieldClass } from "@/components/console/ui";

type Iv = {
  id: string;
  applicationId: string;
  name: string;
  interviewer: string | null;
  interviewerId: string | null;
  start: string;
  end: string;
  status: "scheduled" | "done" | "rescheduled" | "no_show" | "cancelled";
  reschedules: number;
  debriefs: { by: string; wouldHire: Hire; strongest: string | null; concern: string | null; at: string }[];
};
type Hire = "strong_yes" | "yes" | "no" | "strong_no";

export type Board = {
  roleId: string;
  now: number;
  me: string;
  canSchedule: boolean;
  team: { id: string; name: string }[];
  defaultInterviewer: string | null;
  focus: string | null;
  interviews: Iv[];
  waiting: { id: string; applicationId: string; name: string; sentAt: string; slots: number; expired: boolean }[];
  candidates: { id: string; name: string; stage: string; hasEmail: boolean; joined: boolean }[];
};

const HIRE: Record<Hire, string> = { strong_yes: "Strong yes", yes: "Yes", no: "No", strong_no: "Strong no" };
const HIRE_TONE: Record<Hire, "ok" | "signal" | "caution" | "alert"> = { strong_yes: "ok", yes: "signal", no: "caution", strong_no: "alert" };
const when = (d: string) => new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** A datetime-local value (India time) a given number of days from now, at a given hour. */
function slotIn(days: number, hour: number) {
  const d = new Date(Date.now() + days * 86_400_000 + 5.5 * 3_600_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
}

export default function InterviewBoard({ board }: { board: Board }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [debriefing, setDebriefing] = useState<string | null>(board.focus);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, done?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ?? done ?? null) : (r.error ?? "Something went wrong."));
      if (r.ok) {
        setScheduling(null);
        setDebriefing(null);
      }
      router.refresh();
    });

  const live = board.interviews.filter((i) => i.status === "scheduled");
  const upcoming = live.filter((i) => new Date(i.end).getTime() > board.now);
  const needDebrief = board.interviews.filter((i) => (i.status === "done" || (i.status === "scheduled" && new Date(i.end).getTime() <= board.now)) && i.debriefs.length === 0);
  const booked = new Set(board.interviews.filter((i) => i.status === "scheduled" || i.status === "done").map((i) => i.applicationId));
  const waitingIds = new Set(board.waiting.filter((w) => !w.expired).map((w) => w.applicationId));
  const toSchedule = board.candidates.filter((c) => (c.stage === "shortlisted" || c.stage === "interviewing") && !booked.has(c.id) && !waitingIds.has(c.id));
  const debriefed = board.candidates
    .map((c) => ({ ...c, ivs: board.interviews.filter((i) => i.applicationId === c.id && i.debriefs.length) }))
    .filter((c) => c.ivs.length);
  const noShows = board.interviews.filter((i) => i.status === "no_show").length;
  const reschedules = board.interviews.reduce((n, i) => n + i.reschedules, 0);

  if (board.candidates.length === 0 && board.interviews.length === 0)
    return (
      <Empty title="No one to interview yet">
        Shortlist candidates on the <Link href={`/console/roles/${board.roleId}`} className="text-signal hover:underline">Ranking</Link> and they appear here to schedule.
      </Empty>
    );

  return (
    <div className="grid gap-5">
      {msg ? (
        <p role="status" className="rounded-[10px] bg-mist px-3 py-2 text-[13px]">
          {msg}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-slate">
        <span><span className="font-semibold tabular-nums text-ink">{upcoming.length}</span> upcoming</span>
        <span><span className="font-semibold tabular-nums text-ink">{board.waiting.length}</span> waiting on the candidate</span>
        <span><span className={`font-semibold tabular-nums ${needDebrief.length ? "text-caution" : "text-ink"}`}>{needDebrief.length}</span> feedback due</span>
        <span><span className="font-semibold tabular-nums text-ink">{reschedules}</span> reschedules</span>
        <span><span className={`font-semibold tabular-nums ${noShows ? "text-alert" : "text-ink"}`}>{noShows}</span> no-shows</span>
      </div>

      {needDebrief.length ? (
        <Card>
          <CardHead title="Feedback due" meta="Thirty seconds each. This is the only way interview signal reaches the ranking and the analytics." />
          <ul className="divide-y divide-hairline">
            {needDebrief.map((i) => (
              <li key={i.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13.5px]">
                    <span className="font-medium">{i.name}</span> <span className="text-slate">· {when(i.start)}{i.interviewer ? ` · ${i.interviewer}` : ""}</span>
                  </p>
                  <div className="flex gap-2">
                    {i.interviewerId && i.interviewerId !== board.me ? (
                      <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(() => remindDebrief(i.id))}>
                        Remind {i.interviewer?.split(" ")[0]}
                      </Button>
                    ) : null}
                    <Button size="sm" tone={debriefing === i.id ? "ghost" : "primary"} onClick={() => setDebriefing(debriefing === i.id ? null : i.id)}>
                      {debriefing === i.id ? "Close" : "Debrief"}
                    </Button>
                  </div>
                </div>
                {debriefing === i.id ? <DebriefForm pending={pending} onSave={(h, s, c) => run(() => saveDebrief(i.id, h, s, c))} /> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHead title="Upcoming" meta="India time." />
        {upcoming.length === 0 ? (
          <p className="px-4 py-4 text-[13.5px] text-slate">Nothing booked yet.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {upcoming.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0 text-[13.5px]">
                  <Link href={`/console/c/${i.applicationId}`} className="font-medium hover:underline">
                    {i.name}
                  </Link>
                  <p className="text-slate">
                    {when(i.start)}
                    {i.interviewer ? ` · with ${i.interviewer}` : ""}
                    {i.reschedules ? ` · rescheduled ${i.reschedules}×` : ""}
                  </p>
                </div>
                {board.canSchedule ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" disabled={pending} onClick={() => run(() => markInterview(i.id, "done"), "Marked as done")}>
                      Done
                    </Button>
                    <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(async () => { const r = await markInterview(i.id, "rescheduled"); if (r.ok) setScheduling(i.applicationId); return r; }, "Marked for rescheduling. Send new times below.")}>
                      Reschedule
                    </Button>
                    <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(() => markInterview(i.id, "no_show"), "Recorded as a no-show")}>
                      No-show
                    </Button>
                    <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(() => markInterview(i.id, "cancelled"), "Cancelled")}>
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {board.waiting.length ? (
        <Card>
          <CardHead title="Waiting on the candidate" meta="They have a link to pick a time." />
          <ul className="divide-y divide-hairline">
            {board.waiting.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13.5px]">
                <span>
                  <span className="font-medium">{w.name}</span>{" "}
                  <span className="text-slate">
                    · {w.slots} time{w.slots === 1 ? "" : "s"} sent {when(w.sentAt)}
                  </span>
                </span>
                {w.expired ? (
                  <span className="flex items-center gap-2">
                    <Badge tone="caution">All times have passed</Badge>
                    {board.canSchedule ? (
                      <Button size="sm" onClick={() => setScheduling(w.applicationId)}>
                        Send new times
                      </Button>
                    ) : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {board.canSchedule ? (
        <Card>
          <CardHead title="To schedule" meta="Shortlisted, with nothing booked." />
          {toSchedule.length === 0 && !scheduling ? (
            <p className="px-4 py-4 text-[13.5px] text-slate">Everyone shortlisted has a time or a link.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {[...toSchedule, ...board.candidates.filter((c) => c.id === scheduling && !toSchedule.some((t) => t.id === c.id))].map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/console/c/${c.id}`} className="text-[13.5px] font-medium hover:underline">
                      {c.name}
                    </Link>
                    <Button size="sm" tone={scheduling === c.id ? "ghost" : "secondary"} onClick={() => setScheduling(scheduling === c.id ? null : c.id)}>
                      {scheduling === c.id ? "Close" : "Schedule"}
                    </Button>
                  </div>
                  {scheduling === c.id ? (
                    <ScheduleForm
                      board={board}
                      hasEmail={c.hasEmail}
                      pending={pending}
                      onSend={(who, slots, mins) => run(() => sendAvailability(c.id, who, slots, mins))}
                      onBook={(who, at, mins) => run(() => bookDirect(c.id, who, at, mins), `Booked ${c.name}`)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {debriefed.length ? (
        <Card>
          <CardHead title="After interviews" meta="What the interviewers said, and the next step." />
          <ul className="divide-y divide-hairline">
            {debriefed.map((c) => (
              <li key={c.id} className="grid gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13.5px]">
                    <Link href={`/console/c/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    {c.stage === "offer" ? <Badge tone="signal" className="ml-2">Offer out</Badge> : c.stage === "hired" ? <Badge tone="ok" className="ml-2">{c.joined ? "Joined" : "Hired"}</Badge> : null}
                  </p>
                  {board.canSchedule && c.stage === "hired" && !c.joined ? (
                    <Button size="sm" disabled={pending} onClick={() => run(() => markJoined(c.id))}>
                      Mark joined
                    </Button>
                  ) : null}
                  {board.canSchedule && c.stage !== "hired" ? (
                    <div className="flex gap-1.5">
                      {c.stage !== "offer" ? (
                        <Button size="sm" disabled={pending} onClick={() => run(() => setStage(c.id, "offer"), `${c.name}: offer out`)}>
                          Offer out
                        </Button>
                      ) : null}
                      <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(() => setStage(c.id, "hired"), `${c.name}: hired`)}>
                        Mark hired
                      </Button>
                    </div>
                  ) : null}
                </div>
                <ul className="grid gap-1.5">
                  {c.ivs.flatMap((i) =>
                    i.debriefs.map((d, k) => (
                      <li key={`${i.id}-${k}`} className="text-[13px]">
                        <Badge tone={HIRE_TONE[d.wouldHire]}>{HIRE[d.wouldHire]}</Badge> <span className="text-slate">{d.by}</span>
                        {d.strongest ? <span className="block pl-0.5 pt-0.5">Strongest: {d.strongest}</span> : null}
                        {d.concern ? <span className="block pl-0.5">Concern: {d.concern}</span> : null}
                      </li>
                    )),
                  )}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function DebriefForm({ pending, onSave }: { pending: boolean; onSave: (h: Hire, strongest: string, concern: string) => void }) {
  const [hire, setHire] = useState<Hire | null>(null);
  const [strongest, setStrongest] = useState("");
  const [concern, setConcern] = useState("");
  return (
    <form
      className="mt-3 grid gap-3 rounded-[12px] border border-hairline p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (hire) onSave(hire, strongest, concern);
      }}
    >
      <fieldset>
        <legend className="text-[13px] font-medium">Would you hire them?</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(Object.keys(HIRE) as Hire[]).map((h) => (
            <label key={h} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] ${hire === h ? "border-signal bg-signal/[0.06] text-ink" : "border-hairline text-slate hover:text-ink"}`}>
              <input type="radio" name="hire" value={h} className="sr-only" checked={hire === h} onChange={() => setHire(h)} />
              {HIRE[h]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="The strongest thing you saw" optional>
        <input className={fieldClass} value={strongest} onChange={(e) => setStrongest(e.target.value)} />
      </Field>
      <Field label="Your main concern" optional>
        <textarea className={`${areaClass} min-h-16`} value={concern} onChange={(e) => setConcern(e.target.value)} />
      </Field>
      <div>
        <Button type="submit" tone="primary" disabled={pending || !hire}>
          Save debrief
        </Button>
      </div>
    </form>
  );
}

function ScheduleForm({
  board,
  hasEmail,
  pending,
  onSend,
  onBook,
}: {
  board: Board;
  hasEmail: boolean;
  pending: boolean;
  onSend: (who: string, slots: string[], minutes: number) => void;
  onBook: (who: string, at: string, minutes: number) => void;
}) {
  const [mode, setMode] = useState<"link" | "direct">(hasEmail ? "link" : "direct");
  const [who, setWho] = useState(board.defaultInterviewer ?? board.me);
  const [minutes, setMinutes] = useState(45);
  const [slots, setSlots] = useState([slotIn(1, 11), slotIn(1, 15), slotIn(2, 11)]);
  const [at, setAt] = useState(slotIn(1, 11));
  return (
    <form
      className="mt-3 grid gap-3 rounded-[12px] border border-hairline p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "link") onSend(who, slots, minutes);
        else onBook(who, at, minutes);
      }}
    >
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How">
        {(["link", "direct"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={m === "link" && !hasEmail}
            onClick={() => setMode(m)}
            className={`rounded-full border px-3 py-1.5 text-[13px] disabled:opacity-45 ${mode === m ? "border-signal bg-signal/[0.06]" : "border-hairline text-slate hover:text-ink"}`}
          >
            {m === "link" ? "Send times to pick from" : "Already agreed a time"}
          </button>
        ))}
      </div>
      {!hasEmail ? <p className="text-[12.5px] text-slate">No email address on file, so times cannot be sent.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Interviewer">
          <select className={fieldClass} value={who ?? ""} onChange={(e) => setWho(e.target.value)}>
            {board.team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Length">
          <select className={fieldClass} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </Field>
      </div>
      {mode === "link" ? (
        <fieldset className="grid gap-2">
          <legend className="text-[13px] font-medium">Times to offer (India time)</legend>
          {slots.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="datetime-local" aria-label={`Time ${i + 1}`} className={`${smallFieldClass} h-9`} value={s} onChange={(e) => setSlots(slots.map((x, k) => (k === i ? e.target.value : x)))} />
              {slots.length > 1 ? (
                <Button size="sm" tone="ghost" aria-label={`Remove time ${i + 1}`} onClick={() => setSlots(slots.filter((_, k) => k !== i))}>
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
          {slots.length < 6 ? (
            <div>
              <Button size="sm" tone="ghost" onClick={() => setSlots([...slots, slotIn(slots.length, 11)])}>
                Add a time
              </Button>
            </div>
          ) : null}
        </fieldset>
      ) : (
        <Field label="When (India time)">
          <input type="datetime-local" className={`${smallFieldClass} h-9`} value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
      )}
      <div>
        <Button type="submit" tone="primary" disabled={pending}>
          {mode === "link" ? "Send times" : "Book"}
        </Button>
      </div>
    </form>
  );
}
