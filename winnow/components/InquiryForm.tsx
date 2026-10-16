"use client";

import { useState } from "react";
import { EMAIL, MAIL } from "@/lib/site";

const field =
  "mt-1.5 block h-11 w-full rounded-xl border border-hairline bg-paper px-3.5 text-[16px] text-ink placeholder:text-slate/70 transition-[border-color,box-shadow] duration-200 hover:border-slate/40 focus:border-signal focus:shadow-[0_0_0_3px_rgb(27_77_255/0.14)] focus:outline-none";
const label = "block text-[13.5px] font-medium text-ink";

/**
 * A short call request. There is no backend: submitting opens the visitor's
 * email app with the details filled in, addressed to us.
 */
export default function InquiryForm() {
  const [sent, setSent] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const get = (k: string) => String(d.get(k) ?? "").trim();
    const body = [
      `Name: ${get("name")}`,
      `Email: ${get("email")}`,
      `Phone: ${get("phone") || "-"}`,
      `Company: ${get("company")}`,
      `Hiring for: ${get("role") || "-"}`,
    ].join("\n");
    const qs = `subject=${encodeURIComponent(`Call request: ${get("company") || get("name")}`)}&body=${encodeURIComponent(body)}`;
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
            Your email app has opened with your details filled in. Send it, and we will reply to set up the call.
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

          <button type="submit" className="btn-primary mt-7 w-full justify-center">
            Book a call
          </button>
          <p className="mt-3 text-center text-[13px] text-slate">We will reply to find a time that suits you.</p>
        </form>
      )}
    </div>
  );
}
