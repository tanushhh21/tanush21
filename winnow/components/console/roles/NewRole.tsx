"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, areaClass, buttonClass, fieldClass } from "@/components/console/ui";

type Past = { id: string; title: string; closedAt: string | null };

const MODES = [
  { key: "paste", label: "Paste the job description" },
  { key: "upload", label: "Upload it" },
  { key: "past", label: "Start from a past role" },
  { key: "describe", label: "Describe it" },
] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass("primary")}>
      {pending ? "Starting…" : "Continue"}
    </button>
  );
}

/** Step 1: what is the role. The only step that is not skippable. */
export default function NewRole({ action, past, error }: { action: (f: FormData) => Promise<void>; past: Past[]; error?: string }) {
  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>(past.length > 2 ? "past" : "paste");
  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="mode" value={mode} />
      <div role="tablist" aria-label="How to start" className="flex flex-wrap gap-2">
        {MODES.filter((m) => m.key !== "past" || past.length).map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={mode === m.key}
            onClick={() => setMode(m.key)}
            className={`rounded-full border px-3.5 py-1.5 text-[13.5px] transition-colors ${
              mode === m.key ? "border-ink bg-ink text-paper" : "border-hairline text-ink hover:border-slate/40"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="rounded-[10px] bg-alert/[0.06] px-3 py-2.5 text-[13.5px] text-alert">
          {error === "empty" ? "Add a job description, a file, or a few lines about the role." : error}
        </p>
      ) : null}

      <Field label="Role title" optional hint={mode === "past" ? "Leave blank to keep the past role's title." : "Leave blank and Winnow names it from the description."}>
        <input name="title" className={fieldClass} placeholder="e.g. Backend Engineer" />
      </Field>

      {mode === "paste" ? (
        <Field label="Job description">
          <textarea name="jdText" required className={`${areaClass} min-h-64`} placeholder="Paste it as it is. Winnow reads what the hiring manager actually wants out of it." />
        </Field>
      ) : null}

      {mode === "upload" ? (
        <Field label="Job description file" hint="PDF, Word (.docx) or text.">
          <input name="jdFile" type="file" required accept=".pdf,.docx,.txt,.md,.rtf" className="block w-full text-[13.5px] file:mr-3 file:rounded-full file:border file:border-hairline file:bg-paper file:px-3.5 file:py-1.5 file:text-[13px] file:font-medium" />
        </Field>
      ) : null}

      {mode === "past" ? (
        <Field label="Past role" hint="Carries its rubric, its fitted weights, its filters and its sources.">
          <select name="fromRoleId" required className={fieldClass} defaultValue={past[0]?.id}>
            {past.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.closedAt ? " (closed)" : ""}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {mode === "describe" || mode === "paste" || mode === "upload" ? (
        <Field label={mode === "describe" ? "What do you need?" : "Anything the description does not say"} optional={mode !== "describe"} hint="Notes from the intake call: what the hiring manager really wants, what has gone wrong before.">
          <textarea name="intake" required={mode === "describe"} className={areaClass} placeholder="e.g. Owns the payments service from day one. Last two hires struggled with on-call." />
        </Field>
      ) : null}

      {mode !== "past" ? (
        <Field label="People you would hire" optional hint="Three to five CVs of people you'd be happy to hire. Winnow learns what good looks like from them.">
          <input name="examples" type="file" multiple accept=".pdf,.docx,.txt,.md" className="block w-full text-[13.5px] file:mr-3 file:rounded-full file:border file:border-hairline file:bg-paper file:px-3.5 file:py-1.5 file:text-[13px] file:font-medium" />
        </Field>
      ) : null}

      <div className="flex items-center gap-3">
        <Submit />
        <p className="text-[12.5px] text-slate">Everything after this step can be skipped.</p>
      </div>
    </form>
  );
}
