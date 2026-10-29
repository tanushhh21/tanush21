"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyChatDiff, discardChatDiff } from "@/lib/console/actions/rubric";
import { confirmChatAction, discardChatAction } from "@/lib/console/actions/chat";
import type { ChatAction, ChatDiff, ChatExtras } from "@/lib/db/schema";
import { Button, buttonClass } from "@/components/console/ui";

export type ChatMsg = { id: string; author: "user" | "winnow"; body: string; diff: ChatDiff | null; diffState: "proposed" | "applied" | "discarded" | null; extras: ChatExtras | null; at: string };
type Attachment = { name: string; text: string };

const OP: Record<string, string> = { set_weight: "Set weight", set_must_have: "Must-have", add: "Add", remove: "Remove", edit_text: "Reword", add_keywords: "Add keywords" };

/**
 * The chat: a conversation that fills the page, suggestions to start from,
 * and a composer that stays at the bottom. A proposed change shows its effect
 * and waits for Apply.
 */
export default function ChatPanel(p: {
  title: string;
  hint: string;
  messages: ChatMsg[];
  send: (text: string, attachment: Attachment | null) => Promise<{ ok: boolean; error?: string }>;
  suggestions: string[];
  canApply: boolean;
  off?: string | null;
  initial?: string;
  starter?: { title: string; body: string };
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const [text, setText] = useState(p.initial ?? "");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<Attachment | null>(null);
  const [reading, setReading] = useState(false);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (p.initial || p.starter) box.current?.focus();
  }, [p.initial, p.starter]);

  const attach = async (f: File) => {
    setReading(true);
    setError(null);
    const body = new FormData();
    body.set("file", f);
    try {
      const res = await fetch("/api/console/chat/attach", { method: "POST", body });
      const j = (await res.json().catch(() => ({}))) as { name?: string; text?: string; error?: string };
      if (res.ok && j.text) setFile({ name: j.name ?? f.name, text: j.text });
      else setError(j.error ?? "Could not read that file.");
    } catch {
      setError("Could not read that file.");
    }
    setReading(false);
  };
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [p.messages.length, pending]);
  useEffect(() => {
    if (!box.current) return;
    box.current.style.height = "auto";
    box.current.style.height = `${Math.min(box.current.scrollHeight, 200)}px`;
  }, [text]);

  const submit = (value = text) => {
    const t = value.trim();
    if ((!t && !file) || pending || p.off) return;
    const f = file;
    setText("");
    setFile(null);
    setSent(f ? `${t}${t ? "\n\n" : ""}📎 ${f.name}` : t);
    start(async () => {
      const r = await p.send(t, f);
      setError(r.ok ? null : r.error ?? "Something went wrong.");
      if (!r.ok) {
        setText(t);
        setFile(f);
      }
      setSent(null);
      router.refresh();
    });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={p.title}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-3">
        <div className="min-w-0">
          <h1 className="font-display text-[18px] font-semibold tracking-[-0.015em]">{p.title}</h1>
          <p className="text-[13px] text-slate">{p.hint}</p>
        </div>
        {p.actions ? <div className="flex items-center gap-2">{p.actions}</div> : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto py-4" aria-live="polite">
        {p.messages.length === 0 && !sent ? (
          <div className="mx-auto mt-6 max-w-[34rem] text-center">
            <p className="font-display text-[16px] font-semibold">{p.starter?.title ?? "What do you want to know or get done?"}</p>
            <p className="mt-1 text-[13.5px] text-slate">{p.starter?.body ?? "Ask in your own words, or tell Winnow what to do. Try one of these:"}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {p.suggestions.map((s) => (
                <button key={s} type="button" disabled={!!p.off} onClick={() => submit(s)} className="rounded-full border border-hairline bg-paper px-3.5 py-2 text-left text-[13px] text-ink transition-colors hover:border-slate/40 disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <ul className="mx-auto grid max-w-[46rem] gap-4">
          {p.messages.map((m) => (
            <li key={m.id} className={m.author === "user" ? "flex justify-end" : ""}>
              <div className={m.author === "user" ? "max-w-[85%] rounded-[16px] rounded-br-[6px] bg-ink px-4 py-2.5 text-[14px] text-paper" : "max-w-full text-[14.5px] leading-relaxed"}>
                {m.author === "winnow" ? <p className="mb-1 text-[12px] font-medium text-slate">Winnow</p> : null}
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
              {m.diff ? <DiffCard m={m} canApply={p.canApply} /> : null}
              {m.extras?.actions.map((a) => <ActionCard key={a.id} messageId={m.id} a={a} />)}
              {m.extras?.links.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.extras.links.map((l) => (
                    <Link key={l.href} href={l.href} className={buttonClass("secondary", "sm")}>
                      {l.label} →
                    </Link>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
          {sent ? (
            <li className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-[16px] rounded-br-[6px] bg-ink px-4 py-2.5 text-[14px] text-paper">{sent}</div>
            </li>
          ) : null}
          {pending ? (
            <li className="text-[14px] text-slate">
              <span className="inline-flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-signal" aria-hidden="true" />
                Working on it…
              </span>
            </li>
          ) : null}
        </ul>
        <div ref={end} />
      </div>

      <div className="border-t border-hairline pt-3">
        {p.off ? <p className="mb-2 rounded-[10px] bg-caution/[0.08] px-3 py-2 text-[13px] text-ink">{p.off}</p> : null}
        {error ? (
          <p role="alert" className="mb-2 text-[13px] text-alert">
            {error}
          </p>
        ) : null}
        <form
          className="mx-auto flex max-w-[46rem] items-end gap-2 rounded-[16px] border border-hairline bg-paper p-2 focus-within:border-signal focus-within:shadow-[0_0_0_3px_rgb(27_77_255/0.14)]"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <button
            type="button"
            onClick={() => picker.current?.click()}
            disabled={!!p.off || reading || pending}
            aria-label="Attach a job description"
            title="Attach a job description (PDF, Word or text)"
            className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-full text-slate hover:bg-mist hover:text-ink disabled:opacity-50"
          >
            <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
              <path d="m15.5 9.5-5.6 5.6a3.5 3.5 0 0 1-5-5l6.2-6.2a2.3 2.3 0 0 1 3.3 3.3l-6.2 6.2a1.1 1.1 0 0 1-1.6-1.6l5.6-5.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <input ref={picker} type="file" accept=".pdf,.docx,.txt,.md,.rtf" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) attach(f);
            e.target.value = "";
          }} />
          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            disabled={!!p.off}
            aria-label="Message"
            placeholder="Ask anything, or tell Winnow what to do"
            className="max-h-[200px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[16px] leading-snug text-ink placeholder:text-slate/70 focus:outline-none sm:text-[14.5px]"
          />
          <Button type="submit" tone="primary" disabled={pending || reading || (!text.trim() && !file) || !!p.off}>
            Send
          </Button>
        </form>
        {file || reading ? (
          <p className="mx-auto mt-1.5 flex max-w-[46rem] items-center gap-2 px-1 text-[12.5px]">
            {reading ? (
              <span className="text-slate">Reading the file…</span>
            ) : (
              <>
                <span className="rounded-full bg-mist px-2.5 py-1">📎 {file!.name}</span>
                <button type="button" onClick={() => setFile(null)} className="text-slate hover:text-ink">
                  Remove
                </button>
              </>
            )}
          </p>
        ) : null}
        <p className="mx-auto mt-1.5 max-w-[46rem] px-1 text-[11.5px] text-slate">Enter to send, Shift+Enter for a new line. Anything that affects candidates waits for you to confirm it.</p>
      </div>
    </section>
  );
}

function DiffCard({ m, canApply }: { m: ChatMsg; canApply: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const diff = m.diff!;
  return (
    <div className="mt-2 rounded-[14px] border border-hairline bg-mist/50 p-3.5 text-[13.5px]">
      <p className="text-[12px] font-medium text-slate">Proposed change to the criteria</p>
      <ul className="mt-1.5 grid gap-1">
        {(diff.changes as { op: string; text: string | null; weight: number | null; must_have: boolean | null; keywords: string[] }[]).map((ch, i) => (
          <li key={i}>
            <span className="font-medium">{OP[ch.op] ?? ch.op}</span>
            {ch.text ? `: ${ch.text}` : ""}
            {ch.weight ? ` → ${ch.weight}` : ""}
            {ch.must_have != null && ch.op === "set_must_have" ? (ch.must_have ? " → yes" : " → no") : ""}
            {ch.keywords?.length ? `: ${ch.keywords.join(", ")}` : ""}
          </li>
        ))}
      </ul>
      {diff.impact ? (
        <p className="mt-2 text-slate">
          Effect: {diff.impact.moved} {diff.impact.moved === 1 ? "person changes" : "people change"} place
          {diff.impact.enteredTop.length ? `; into the top: ${diff.impact.enteredTop.join(", ")}` : ""}
          {diff.impact.leftTop.length ? `; out of the top: ${diff.impact.leftTop.join(", ")}` : ""}.
        </p>
      ) : null}
      {m.diffState === "proposed" && canApply ? (
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" tone="primary" disabled={pending} onClick={() => start(async () => { await applyChatDiff(m.id); router.refresh(); })}>
            Apply
          </Button>
          <Button size="sm" tone="ghost" disabled={pending} onClick={() => start(async () => { await discardChatDiff(m.id); router.refresh(); })}>
            Discard
          </Button>
        </div>
      ) : m.diffState === "applied" ? (
        <p className="mt-2 text-ok">Applied. Everyone has been re-scored.</p>
      ) : m.diffState === "discarded" ? (
        <p className="mt-2 text-slate">Discarded.</p>
      ) : (
        <p className="mt-2 text-slate">A preview only. Nothing was changed.</p>
      )}
    </div>
  );
}

const KIND: Record<ChatAction["kind"], string> = { decide: "Decision", ask: "Email to candidates", criteria: "Change to the criteria", close: "Close the role" };

/** A proposal from the assistant. Nothing happens until Confirm. */
function ActionCard({ messageId, a }: { messageId: string; a: ChatAction }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : r.error ?? "Something went wrong.");
      router.refresh();
    });
  return (
    <div className={`mt-2 rounded-[14px] border p-3.5 text-[13.5px] ${a.state === "proposed" ? "border-signal/30 bg-signal/[0.03]" : "border-hairline bg-mist/40"}`}>
      <p className="text-[11.5px] font-medium uppercase tracking-[0.05em] text-slate">{KIND[a.kind]}</p>
      <p className="mt-1 font-medium">{a.title}</p>
      {a.detail.length ? (
        <ul className="mt-1 grid gap-0.5 text-slate">
          {a.detail.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      ) : null}
      {a.state === "proposed" ? (
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" tone="primary" disabled={pending} onClick={() => go(() => confirmChatAction(messageId, a.id))}>
            {pending ? "Working…" : "Confirm"}
          </Button>
          <Button size="sm" tone="ghost" disabled={pending} onClick={() => go(() => discardChatAction(messageId, a.id))}>
            Discard
          </Button>
        </div>
      ) : (
        <p className={`mt-2 ${a.state === "done" ? "text-ok" : a.state === "failed" ? "text-alert" : "text-slate"}`}>
          {a.state === "done" ? `✓ ${a.result ?? "Done."}` : a.state === "failed" ? `Did not work: ${a.result ?? ""}` : "Discarded."}
        </p>
      )}
      {error ? <p role="alert" className="mt-1.5 text-alert">{error}</p> : null}
    </div>
  );
}
