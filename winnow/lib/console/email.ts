/**
 * Outgoing email. In production it goes through Resend; without a key (local
 * development and tests) each message is appended to .data/outbox.jsonl
 * instead, so nothing is ever sent by accident.
 */
import { appendFileSync, mkdirSync } from "node:fs";

export const EMAIL_FROM = process.env.EMAIL_FROM || "Winnow <hello@getwinnow.in>";

export type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Plain, readable HTML in the Winnow style: paragraphs, and an optional button. */
export function layout(paragraphs: string[], button?: { label: string; href: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${esc(p)}</p>`).join("");
  const cta = button
    ? `<p style="margin:24px 0"><a href="${esc(button.href)}" style="background:#1B4DFF;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:500;display:inline-block">${esc(button.label)}</a></p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0A0C0F;max-width:520px">${body}${cta}<p style="margin:32px 0 0;color:#6B7280;font-size:13px">Winnow</p></div>`;
}

export function loginEmail(url: string) {
  return {
    subject: "Your Winnow sign-in link",
    text: `Sign in to Winnow: ${url}\n\nThe link works once and expires in 24 hours. If you did not ask for it, ignore this email.`,
    html: layout(["Use the button below to sign in to Winnow.", "The link works once and expires in 24 hours. If you did not ask for it, ignore this email."], {
      label: "Sign in",
      href: url,
    }),
  };
}

/** Domains reserved for examples (RFC 2606 and 6761): no mailbox exists there, so nothing is sent. The demo company lives on them. */
export const reservedAddress = (to: string) => /@(?:[^@\s]+\.)?(?:example\.(?:com|net|org)|example|test|invalid|localhost)$/i.test(to.trim());

export async function sendEmail(m: Email): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.VERCEL) return { ok: false, error: "Email is not set up yet (RESEND_API_KEY)." };
    mkdirSync(".data", { recursive: true });
    appendFileSync(".data/outbox.jsonl", JSON.stringify({ at: new Date().toISOString(), from: m.from ?? EMAIL_FROM, ...m }) + "\n");
    return { ok: true, id: "outbox" };
  }
  if (reservedAddress(m.to)) return { ok: true, id: "reserved" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: m.from ?? EMAIL_FROM,
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
      reply_to: m.replyTo,
      attachments: m.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64"), content_type: a.contentType })),
    }),
  });
  if (!res.ok) return { ok: false, error: `Email failed (${res.status})` };
  const data = (await res.json()) as { id?: string };
  return { ok: true, id: data.id };
}
