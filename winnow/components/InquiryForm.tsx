"use client";

import { useState } from "react";
import { EMAIL, MAIL } from "@/lib/site";

const INTENTS = [
  {
    id: "hire",
    label: "Hire for a role",
    subject: "Hiring inquiry",
    roles: "Roles you are hiring for",
    hint: "e.g. 5 SDE interns in Bengaluru",
  },
  {
    id: "blind",
    label: "Run a blind test",
    subject: "Blind test request",
    roles: "Roles you have already filled",
    hint: "e.g. 10 engineering roles from the last year",
  },
] as const;

type Intent = (typeof INTENTS)[number]["id"];

const field =
  "mt-1.5 block h-11 w-full rounded-xl border border-hairline bg-paper px-3.5 text-[16px] text-ink placeholder:text-slate/70 transition-[border-color,box-shadow] duration-200 hover:border-slate/40 focus:border-signal focus:shadow-[0_0_0_3px_rgb(27_77_255/0.14)] focus:outline-none";

/**
 * A short inquiry form. There is no backend: submitting opens the visitor's
 * email app with the details filled in, addressed to us.
 */
export default function InquiryForm() {
  const [intent, setIntent] = useState<Intent>("hire");
  const [sent, setSent] = useState(false);
  const it = INTENTS.find((i) => i.id === intent)!;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const get = (k: string) => String(d.get(k) ?? "").trim();
    const from = get("company") || get("name");
    const body = [
      `Name: ${get("name")}`,
      `Email: ${get("email")}`,
      `Company: ${get("company")}`,
      `${it.roles}: ${get("roles") || "-"}`,
    ].join("\n");
    const qs = `subject=${encodeURIComponent(`${it.subject} from ${from}`)}&body=${encodeURIComponent(body)}`;
    window.location.href = `${MAIL}?${qs}`;
    setSent(true);
  }

  return (
    <div className="mt-12 w-full max-w-[30rem] rounded-[22px] bg-paper p-6 text-left shadow-lift ring-1 ring-hairline sm:p-8">
      {sent ? (
        <div role="status" className="py-4 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-signal/10 text-signal">
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
              <path d="M5 10.5l3.2 3L15 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="mt-5 font-display text-[1.375rem] font-semibold tracking-[-0.02em] text-ink">Almost there.</p>
          <p className="mx-auto mt-2 max-w-[22rem] text-[15px] leading-relaxed text-slate">
            Your email app has opened with your details filled in. Send it and we will be in touch.
          </p>
          <p className="mt-5 text-[14px] text-slate">
            Nothing opened? Write to{" "}
            <a href={MAIL} className="link-underline text-ink">
              {EMAIL}
            </a>
          </p>
          <button type="button" onClick={() => setSent(false)} className="link-chevron mt-6">
            Edit details
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <fieldset>
            <legend className="sr-only">What would you like to do?</legend>
            <div className="grid grid-cols-2 gap-1 rounded-full bg-mist p-1">
              {INTENTS.map((i) => (
                <label
                  key={i.id}
                  className={`cursor-pointer rounded-full px-3 py-2 text-center text-[14px] font-medium transition-[background-color,color,box-shadow] duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal ${
                    intent === i.id ? "bg-paper text-ink shadow-lift" : "text-slate hover:text-ink"
                  }`}
                >
                  <input
                    type="radio"
                    name="intent"
                    value={i.id}
                    checked={intent === i.id}
                    onChange={() => setIntent(i.id)}
                    className="sr-only"
                  />
                  {i.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="block text-[13.5px] font-medium text-ink">
              Name
              <input name="name" required autoComplete="name" className={field} />
            </label>
            <label className="block text-[13.5px] font-medium text-ink">
              Work email
              <input name="email" type="email" required autoComplete="email" className={field} />
            </label>
          </div>
          <label className="mt-4 block text-[13.5px] font-medium text-ink">
            Company
            <input name="company" required autoComplete="organization" className={field} />
          </label>
          <label className="mt-4 block text-[13.5px] font-medium text-ink">
            {it.roles} <span className="font-normal text-slate">(optional)</span>
            <input name="roles" placeholder={it.hint} className={field} />
          </label>

          <button type="submit" className="btn-primary mt-7 w-full justify-center">
            Send inquiry
          </button>
        </form>
      )}
    </div>
  );
}
