/** A calendar invite (.ics) for an interview, readable by Google Calendar and Outlook. */
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export function ics(o: { uid: string; start: Date; end: Date; title: string; description: string; organizer: string; attendees: string[] }) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Winnow//Interviews//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${o.uid}@getwinnow.in`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(o.start)}`,
    `DTEND:${stamp(o.end)}`,
    `SUMMARY:${esc(o.title)}`,
    `DESCRIPTION:${esc(o.description)}`,
    `ORGANIZER:mailto:${o.organizer}`,
    ...o.attendees.map((a) => `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${a}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export const ist = (d: Date | string) =>
  new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** A datetime-local value typed in India, as a real instant. */
export const fromIst = (local: string) => new Date(`${local}:00+05:30`);
