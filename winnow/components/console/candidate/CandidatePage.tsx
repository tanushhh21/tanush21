"use client";

import { useRouter } from "next/navigation";
import type { Candidate } from "@/lib/console/data/candidate";
import type { Reason } from "@/lib/console/data/ranking";
import CandidateView from "./CandidateView";

/** The full-page candidate (the shareable URL); refreshes itself after changes. */
export default function CandidatePage(p: { data: Candidate; reasons: Reason[]; canAsk: boolean; neighbours: { id: string; name: string; rank: number | null }[] }) {
  const router = useRouter();
  return <CandidateView {...p} onChanged={() => router.refresh()} />;
}
