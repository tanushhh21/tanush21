"use client";

import { useState } from "react";
import { EMAIL, MAIL, WEB3FORMS_KEY } from "@/lib/site";

const field =
  "mt-1.5 block h-11 w-full rounded-xl border border-hairline bg-paper px-3.5 text-[16px] text-ink placeholder:text-slate/70 transition-[border-color,box-shadow] duration-200 hover:border-slate/40 focus:border-signal focus:shadow-[0_0_0_3px_rgb(27_77_255/0.14)] focus:outline-none";
const label = "block text-[13.5px] font-medium text-ink";

type State = "form" | "sending" | "delivered" | "mailed" | "failed";

function Tick() {
  return (
    <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-signal/10 text-signal">
      <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
        <path d="M5 10.5l3.2 3L15 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * A short call request. With a Web3Forms key it is emailed straight to us;
 * without one, it opens the visitor's email app with the details filled in.
 * If the service cannot be reached, the visitor can still send it by email.
 */
export default function InquiryForm() {
  const [state, setState] = useState<State>("form");
  const [name, setName] = useState("");
  const [mailto, setMailto] = useState(MAIL);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
    const d = new FormData(e.currentTarget);
    const get = (k: string) => String(d.get(k) ?? "").trim();
    // Bots fill in the hidden box; show them success and send nothing.
    if (get("botcheck")) return setState("delivered");

    const fields = {
      Name: get("name"),
      Email: get("email"),
      Phone: get("phone") || "-",
      Company: get("company"),
      "Hiring for": get("role") || "-",
    };
    const subject = `Call request: ${fields.Company || fields.Name}`;
    const body = Object.entries(fields)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const link = `${MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setName(fields.Name.split(" ")[0]);
    setMailto(link);

    if (!WEB3FORMS_KEY) {
      window.location.href = link;
      return setState("mailed");
    }

    setState("sending");
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject,
          from_name: "Winnow website",
          replyto: fields.Email,
          ...fields,
          Page: window.location.pathname,
        }),
        signal: AbortSignal.timeout(12000),
      });
      const json = await res.json().catch(() => null);
      setState(res.ok && json?.success ? "delivered" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="mt-12 w-full max-w-[30rem] rounded-[22px] bg-paper p-6 text-left shadow-lift ring-1 ring-hairline sm:p-8">
      {state === "delivered" ? (
        <div role="status" className="py-4 text-center">
          <Tick />
          <p className="mt-5 font-display text-[1.375rem] font-semibold tracking-[-0.02em] text-ink">
            Thank you{name ? `, ${name}` : ""}.
          </p>
          <p className="mx-auto mt-2 max-w-[22rem] text-[15px] leading-relaxed text-slate">
            We have your details and will be in touch shortly to set up the call.
          </p>
          <button type="button" onClick={() => setState("form")} className="link-chevron mt-6">
            Send another request
          </button>
        </div>
      ) : state === "mailed" ? (
        <div role="status" className="py-4 text-center">
          <Tick />
          <p className="mt-5 font-display text-[1.375rem] font-semibold tracking-[-0.02em] text-ink">Almost there.</p>
          <p className="mx-auto mt-2 max-w-[22rem] text-[15px] leading-relaxed text-slate">
            Your email app has opened with your details filled in. Send it, and we will reply to set up the call.
          </p>
          <p className="mt-5 text-[14px] text-slate">
            Nothing opened? Write to{" "}
            <a href={MAIL} className="link-underline text-ink">
              {EMAIL}
            </a>
          </p>
          <button type="button" onClick={() => setState("form")} className="link-chevron mt-6">
            Edit details
          </button>
        </div>
      ) : state === "failed" ? (
        <div role="alert" className="py-4 text-center">
          <p className="font-display text-[1.375rem] font-semibold tracking-[-0.02em] text-ink">That didn&rsquo;t go through.</p>
          <p className="mx-auto mt-2 max-w-[22rem] text-[15px] leading-relaxed text-slate">
            Your details are ready to send by email instead.
          </p>
          <a href={mailto} className="btn-primary mt-6">
            Email it to us
          </a>
          <div>
            <button type="button" onClick={() => setState("form")} className="link-chevron mt-5">
              Try again
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} aria-busy={state === "sending"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Name
              <input name="name" required autoComplete="name" className={field} />
            </label>
            <label className={label}>
              Work email
              <input name="email" type="email" required autoComplete="email" className={field} />
            </label>
            <label className={label}>
              Company
              <input name="company" required autoComplete="organization" className={field} />
            </label>
            <label className={label}>
              Phone <span className="font-normal text-slate">(optional)</span>
              <input name="phone" type="tel" autoComplete="tel" className={field} />
            </label>
          </div>
          <label className={`${label} mt-4`}>
            What are you hiring for? <span className="font-normal text-slate">(optional)</span>
            <input name="role" placeholder="e.g. 5 SDE interns in Bengaluru" className={field} />
          </label>
          {/* Left empty by people; bots tick it. */}
          <input type="checkbox" name="botcheck" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

          <button
            type="submit"
            disabled={state === "sending"}
            className="btn-primary mt-7 w-full justify-center disabled:pointer-events-none disabled:opacity-70"
          >
            {state === "sending" ? "Sending…" : "Book a call"}
          </button>
          <p className="mt-3 text-center text-[13px] text-slate">We will reply to find a time that suits you.</p>
        </form>
      )}
    </div>
  );
}
