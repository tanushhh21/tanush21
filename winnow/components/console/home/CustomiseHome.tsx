"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHomeLayout } from "@/lib/console/actions/home";
import { DEFAULT_LAYOUT, MAX_STATS, NEEDS_CHOICES, SECTIONS, STATS, type HomeLayout, type SectionId, type StatId } from "@/lib/console/homeLayout";
import { Button, buttonClass } from "@/components/console/ui";

/** A side panel where each person arranges their own Home. Changes are theirs alone. */
export default function CustomiseHome({ layout }: { layout: HomeLayout }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<HomeLayout>(layout);
  const [pending, start] = useTransition();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(layout);
    panel.current?.querySelector<HTMLElement>("input, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };
  const move = (id: SectionId, by: -1 | 1) =>
    setDraft((d) => {
      const order = [...d.order];
      const i = order.indexOf(id);
      const j = i + by;
      if (j < 0 || j >= order.length) return d;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...d, order };
    });
  const toggleSection = (id: SectionId) => setDraft((d) => ({ ...d, hidden: d.hidden.includes(id) ? d.hidden.filter((x) => x !== id) : [...d.hidden, id] }));
  const toggleStat = (id: StatId) =>
    setDraft((d) => ({ ...d, stats: d.stats.includes(id) ? d.stats.filter((x) => x !== id) : d.stats.length < MAX_STATS ? [...d.stats, id] : d.stats }));
  const save = (l: HomeLayout | null) =>
    start(async () => {
      await saveHomeLayout(l);
      router.refresh();
      close();
    });

  return (
    <>
      <button ref={opener} type="button" onClick={() => setOpen(true)} className={buttonClass("ghost")} aria-haspopup="dialog">
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
          <path d="M3.75 6.25h6.5M13.75 6.25h2.5M3.75 13.75h2.5M9.75 13.75h6.5M12 4.25v4M8 11.75v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Customise
      </button>
      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="customise-title">
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-ink/20" />
          <div ref={panel} className="absolute inset-y-0 right-0 flex w-full max-w-[24rem] flex-col border-l border-hairline bg-paper shadow-[0_10px_40px_rgb(10_12_15/0.12)]">
            <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
              <div>
                <h2 id="customise-title" className="text-[15px] font-semibold">
                  Customise your Home
                </h2>
                <p className="mt-0.5 text-[12.5px] text-slate">Only you see these changes.</p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="grid size-8 place-items-center rounded-[6px] text-slate hover:bg-mist hover:text-ink">
                <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
                  <path d="m6 6 8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-7 overflow-y-auto px-5 py-5">
              <fieldset className="min-w-0">
                <legend className="text-[13px] font-semibold">Sections</legend>
                <p className="mt-0.5 text-[12px] text-slate">Show or hide each one, and move it up or down.</p>
                <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1">
                  {draft.order.map((id, i) => {
                    const shown = !draft.hidden.includes(id);
                    return (
                      <li key={id} className={`flex items-center gap-3 rounded-[8px] border border-hairline px-3 py-2 ${shown ? "" : "bg-mist/50"}`}>
                        <input id={`sec-${id}`} type="checkbox" checked={shown} onChange={() => toggleSection(id)} className="size-4 accent-[#1b4dff]" />
                        <label htmlFor={`sec-${id}`} className="min-w-0 flex-1">
                          <span className={`block text-[13px] font-medium ${shown ? "text-ink" : "text-slate"}`}>{SECTIONS[id].label}</span>
                          <span className="block truncate text-[11.5px] text-slate">{SECTIONS[id].hint}</span>
                        </label>
                        <span className="flex shrink-0">
                          <button type="button" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Move ${SECTIONS[id].label} up`} className="grid size-7 place-items-center rounded-[5px] text-slate hover:bg-mist hover:text-ink disabled:opacity-30">
                            <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden="true">
                              <path d="m5.5 12 4.5-4.5 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => move(id, 1)} disabled={i === draft.order.length - 1} aria-label={`Move ${SECTIONS[id].label} down`} className="grid size-7 place-items-center rounded-[5px] text-slate hover:bg-mist hover:text-ink disabled:opacity-30">
                            <svg viewBox="0 0 20 20" className="size-3.5" aria-hidden="true">
                              <path d="m5.5 8 4.5 4.5L14.5 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11.5px] text-slate">“While you were away” sits beside the others on wide screens.</p>
              </fieldset>

              <fieldset className="min-w-0">
                <legend className="float-left flex w-full items-baseline justify-between text-[13px] font-semibold">
                  Numbers{" "}
                  <span className="text-[12px] font-normal tabular-nums text-slate">
                    {draft.stats.length} of {MAX_STATS}
                  </span>
                </legend>
                <p className="clear-both pt-0.5 text-[12px] text-slate">Pick up to four for the top of the page.</p>
                <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {(Object.keys(STATS) as StatId[]).map((id) => {
                    const on = draft.stats.includes(id);
                    const full = !on && draft.stats.length >= MAX_STATS;
                    return (
                      <label key={id} className={`flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[13px] ${full ? "text-slate/60" : "hover:bg-mist/60"}`}>
                        <input type="checkbox" checked={on} disabled={full} onChange={() => toggleStat(id)} className="size-4 accent-[#1b4dff]" />
                        {STATS[id]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="min-w-0">
                <legend className="text-[13px] font-semibold">Needs you on Home</legend>
                <p className="mt-0.5 text-[12px] text-slate">How many items to show before “See all”.</p>
                <div role="radiogroup" className="mt-3 inline-flex gap-0.5 rounded-[7px] bg-ink/[0.045] p-0.5">
                  {NEEDS_CHOICES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={draft.needsShown === n}
                      onClick={() => setDraft((d) => ({ ...d, needsShown: n }))}
                      className={`h-7 min-w-10 rounded-[5px] px-3 text-[12.5px] tabular-nums ${draft.needsShown === n ? "bg-paper font-medium text-ink shadow-[0_1px_2px_rgb(10_12_15/0.08)]" : "text-slate hover:text-ink"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="flex items-center gap-2 border-t border-hairline px-5 py-3.5">
              <button type="button" onClick={() => setDraft(DEFAULT_LAYOUT)} className="text-[12.5px] text-slate hover:text-ink" disabled={pending}>
                Reset to default
              </button>
              <span className="flex-1" />
              <Button onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button tone="primary" onClick={() => save(draft)} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
