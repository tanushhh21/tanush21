import type { Metadata } from "next";
import { pageMeta } from "@/lib/site";
import PageHead from "@/components/PageHead";
import InquiryForm from "@/components/InquiryForm";

export const metadata: Metadata = {
  title: "Join the waitlist",
  ...pageMeta(
    "/waitlist",
    "Join the waitlist · Winnow",
    "Winnow sources, evaluates and shortlists candidates for Indian companies. Join the waitlist and we will write when there is a place.",
  ),
};

/** A shareable signup page: getwinnow.in/waitlist. Signups are emailed to us like call requests. */
export default function Waitlist() {
  return (
    <main>
      <PageHead
        label="Waitlist"
        title="Hiring, handled up to the interview."
        sub="We source, evaluate and shortlist. You pick who to meet. Leave your details and we will write when there is a place for your team."
      />
      <section aria-label="Join the waitlist" className="section-y pt-0!">
        <div className="wrap flex justify-center">
          <InquiryForm kind="waitlist" />
        </div>
      </section>
    </main>
  );
}
