"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Polls a role's progress and refreshes the page when `until` becomes true. */
export default function Waiter({ roleId, until, every = 2500 }: { roleId: string; until: "rubric" | "idle"; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await fetch(`/api/console/roles/${roleId}/progress`, { cache: "no-store" });
        const p = (await r.json()) as { version: number; busy: boolean; rubricFailed: number };
        if ((until === "rubric" && (p.version > 0 || p.rubricFailed > 0)) || (until === "idle" && !p.busy)) {
          router.refresh();
          return;
        }
      } catch {}
      setTimeout(tick, every);
    };
    const t = setTimeout(tick, every);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [roleId, until, every, router]);
  return null;
}
