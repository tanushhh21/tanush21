"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, fieldClass } from "@/components/console/ui";

const ACCEPT = [".pdf", ".docx", ".txt", ".md", ".rtf", ".doc"];
type Item = { name: string; state: "waiting" | "sending" | "done" | "error"; error?: string };

/** Upload CVs: several files or a whole folder, three at a time, each with its own status. */
export default function Uploader({ roleId, source = "upload", compact = false }: { roleId: string; source?: "upload" | "referral"; compact?: boolean }) {
  const router = useRouter();
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [referredBy, setReferredBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  async function send(list: File[]) {
    const ok = list.filter((f) => ACCEPT.some((e) => f.name.toLowerCase().endsWith(e)) && !f.name.startsWith("."));
    const skipped = list.length - ok.length;
    if (ok.length === 0) {
      setItems([{ name: skipped ? `${skipped} file${skipped === 1 ? "" : "s"} skipped: not PDF, Word or text` : "No files", state: "error" }]);
      return;
    }
    setBusy(true);
    const state: Item[] = ok.map((f) => ({ name: f.name, state: "waiting" }));
    if (skipped) state.push({ name: `${skipped} other file${skipped === 1 ? "" : "s"} skipped (not PDF, Word or text)`, state: "error" });
    setItems([...state]);
    let next = 0;
    const worker = async () => {
      while (next < ok.length) {
        const i = next++;
        state[i] = { ...state[i], state: "sending" };
        setItems([...state]);
        const body = new FormData();
        body.set("roleId", roleId);
        body.set("source", source);
        if (referredBy) body.set("referredBy", referredBy);
        body.set("file", ok[i]);
        try {
          const res = await fetch("/api/console/upload", { method: "POST", body });
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          state[i] = res.ok ? { ...state[i], state: "done" } : { ...state[i], state: "error", error: json.error ?? `Failed (${res.status})` };
        } catch {
          state[i] = { ...state[i], state: "error", error: "Network error" };
        }
        setItems([...state]);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(false);
    router.refresh();
  }

  const done = items.filter((i) => i.state === "done").length;
  const failed = items.filter((i) => i.state === "error").length;

  const inputs = (
    <>
      <input ref={files} type="file" multiple={source === "upload"} accept={ACCEPT.join(",")} className="hidden" onChange={(e) => e.target.files && send(Array.from(e.target.files))} />
      <input
        ref={folder}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => e.target.files && send(Array.from(e.target.files))}
      />
    </>
  );
  const status = items.length ? (
    <div className="mt-3" aria-live="polite">
      <p className="text-[13px] text-ink">
        {busy ? `Uploading ${done + failed} of ${items.length}` : `${done} uploaded${failed ? `, ${failed} not uploaded` : ""}`}
        {done && !busy ? <span className="text-slate">. Winnow is reading them now.</span> : null}
      </p>
      <ul className="mt-2 max-h-48 overflow-y-auto text-[12.5px]">
        {items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-3 border-b border-hairline py-1.5 last:border-0">
            <span className="truncate">{it.name}</span>
            <span className={`shrink-0 ${it.state === "error" ? "text-alert" : it.state === "done" ? "text-ok" : "text-slate"}`}>
              {it.state === "error" ? it.error ?? "Skipped" : it.state === "done" ? "Uploaded" : it.state === "sending" ? "Uploading" : "Waiting"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  // In a header: one button, and the choice of files or a folder behind it.
  if (compact && source === "upload")
    return (
      <div className="relative">
        <button type="button" disabled={busy} onClick={() => setMenu(!menu)} aria-expanded={menu} className={buttonClass("primary", "sm")}>
          {busy ? "Uploading…" : "Add CVs"}
        </button>
        {menu || items.length ? (
          <div className="absolute right-0 top-10 z-30 w-[min(20rem,86vw)] rounded-[12px] border border-hairline bg-paper p-3 text-[13px] shadow-lift-hover">
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => files.current?.click()} className={buttonClass("secondary", "sm")}>
                Choose files
              </button>
              <button type="button" disabled={busy} onClick={() => folder.current?.click()} className={buttonClass("secondary", "sm")}>
                A whole folder
              </button>
              {!busy ? (
                <button type="button" onClick={() => { setMenu(false); setItems([]); }} className="ml-auto text-[12.5px] text-slate hover:text-ink">
                  Close
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[12px] text-slate">PDF, Word or text, up to 4 MB each. Winnow reads and ranks them.</p>
            {status}
          </div>
        ) : null}
        {inputs}
      </div>
    );

  return (
    <div className={compact ? "" : "rounded-[14px] border border-dashed border-hairline bg-mist/50 p-5"}>
      {source === "referral" ? (
        <label className="mb-3 block">
          <span className="text-[13px] font-medium">Referred by</span>
          <input value={referredBy} onChange={(e) => setReferredBy(e.target.value)} className={`${fieldClass} mt-1.5`} placeholder="Who referred them" />
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => files.current?.click()} className={buttonClass(compact ? "secondary" : "primary", compact ? "sm" : "md")}>
          {source === "referral" ? "Upload their CV" : "Upload CVs"}
        </button>
        {source === "upload" ? (
          <button type="button" disabled={busy} onClick={() => folder.current?.click()} className={buttonClass("secondary", compact ? "sm" : "md")}>
            Upload a folder
          </button>
        ) : null}
        {!compact ? <span className="text-[12.5px] text-slate">PDF, Word (.docx) or text, up to 4 MB each.</span> : null}
      </div>
      {inputs}
      {status}
    </div>
  );
}
