"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyChatDiff, discardChatDiff } from "@/lib/console/actions/rubric";
import type { ChatDiff } from "@/lib/db/schema";
import { Button, areaClass } from "@/components/console/ui";

export type ChatMsg = { id: string; author: "user" | "winnow"; body: string; diff: ChatDiff | null; diffState: "proposed" | "applied" | "discarded" | null; at: string };

const OP: Record<string, string> = { set_weight: "Set weight", set_must_have: "Must-have", add: "Add", remove: "Remove", edit_text: "Reword", add_keywords: "Add keywords" };

/**
 * Chat that reads everything and writes only through a confirmed diff: a
 * proposed change shows its effect and waits for Apply.
 */
export default function Chat({ messages, send, placeholder, title, canApply = true }: { messages: ChatMsg[]; send: (text: string) => Promise<{ ok: boolean; error?: string }>; placeholder: string; title: string; canApply?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [messages.length]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    start(async () => {
      const r = await send(t);
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else setError(null);
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col rounded-[14px] border border-hairline bg-paper" aria-label={title}>
      <header className="border-b border-hairline px-4 py-3">
        <h2 className="font-display text-[15px] font-semibold">{title}</h2>
        <p className="text-[12px] text-slate">Reads everything you can. Changes nothing until you confirm.</p>
      </header>
      <div className="max-h-[28rem] min-h-40 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? <p className="text-[13px] text-slate">{placeholder}</p> : null}
        <ul className="grid gap-3">
          {messages.map((m) => (
            <li key={m.id} className={m.author === "user" ? "ml-8" : "mr-4"}>
              <div className={`rounded-[14px] px-3.5 py-2.5 text-[13.5px] ${m.author === "user" ? "rounded-br-md bg-ink text-paper" : "rounded-bl-md bg-mist"}`}>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
              {m.diff ? (
                <div className="mt-2 rounded-[12px] border border-hairline p-3 text-[13px]">
                  <ul className="grid gap-1">
                    {(m.diff.changes as { op: string; text: string | null; weight: number | null; must_have: boolean | null; key: string | null; keywords: string[] }[]).map((ch, i) => (
                      <li key={i}>
                        <span className="font-medium">{OP[ch.op] ?? ch.op}</span>
                        {ch.text ? `: ${ch.text}` : ""}
                        {ch.weight ? ` → ${ch.weight}` : ""}
                        {ch.must_have != null && ch.op === "set_must_have" ? (ch.must_have ? " → yes" : " → no") : ""}
                        {ch.keywords?.length ? `: ${ch.keywords.join(", ")}` : ""}
                      </li>
                    ))}
                  </ul>
                  {m.diff.impact ? (
                    <p className="mt-2 text-slate">
                      Effect: {m.diff.impact.moved} change place
                      {m.diff.impact.enteredTop.length ? `; into the top: ${m.diff.impact.enteredTop.join(", ")}` : ""}
                      {m.diff.impact.leftTop.length ? `; out: ${m.diff.impact.leftTop.join(", ")}` : ""}.
                    </p>
                  ) : null}
                  {m.diffState === "proposed" && canApply ? (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" tone="primary" disabled={pending} onClick={() => start(async () => { await applyChatDiff(m.id); router.refresh(); })}>
                        Apply
                      </Button>
                      <Button size="sm" tone="ghost" disabled={pending} onClick={() => start(async () => { await discardChatDiff(m.id); router.refresh(); })}>
                        Discard
                      </Button>
                    </div>
                  ) : m.diffState === "applied" ? (
                    <p className="mt-2 text-ok">Applied as a new rubric version.</p>
                  ) : m.diffState === "discarded" ? (
                    <p className="mt-2 text-slate">Discarded.</p>
                  ) : (
                    <p className="mt-2 text-slate">A preview only. Nothing was applied.</p>
                  )}
                </div>
              ) : null}
            </li>
          ))}
          {pending ? <li className="mr-4 rounded-[14px] bg-mist px-3.5 py-2.5 text-[13.5px] text-slate">Thinking…</li> : null}
        </ul>
        <div ref={end} />
      </div>
      {error ? <p role="alert" className="px-4 pb-2 text-[12.5px] text-alert">{error}</p> : null}
      <form
        className="flex items-end gap-2 border-t border-hairline p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          aria-label="Message"
          placeholder="Ask, or ask for a change"
          className={`${areaClass} min-h-10 py-2`}
        />
        <Button type="submit" tone="primary" disabled={pending || !text.trim()}>
          Send
        </Button>
      </form>
    </section>
  );
}
