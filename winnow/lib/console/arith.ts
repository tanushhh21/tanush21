/**
 * The scoring arithmetic, with no database code, so the browser can use it too
 * (the Rubric editor previews what an edit would do before it is saved).
 */
import type { Band, Support, VerdictValue } from "@/lib/db/schema";

export const BAR = 55;
const VALUE: Record<VerdictValue, number | null> = { met: 1, partial: 0.5, not_met: 0, unknown: null };

export type ReqLite = { key: string; weight: number; mustHave: boolean; text: string };
export type VerdictLite = { requirementKey: string; verdict: VerdictValue; support: Support | null };

export function arithmetic(reqs: ReqLite[], vs: VerdictLite[], openContradictions = 0) {
  const by = new Map(vs.map((v) => [v.requirementKey, v]));
  let total = 0;
  let known = 0;
  let earned = 0;
  let unknownWeight = 0;
  let mustTotal = 0;
  let mustMet = 0;
  let mustMissing = false;
  let mustUnproven = false;
  for (const r of reqs) {
    const v = by.get(r.key);
    total += r.weight;
    const value = v ? VALUE[v.verdict] : null;
    if (value == null) unknownWeight += r.weight;
    else {
      known += r.weight;
      earned += r.weight * value;
    }
    if (r.mustHave) {
      mustTotal++;
      if (v?.verdict === "met") {
        mustMet++;
        if (v.support === "self_reported" || v.support == null) mustUnproven = true;
      } else if (v?.verdict === "not_met") mustMissing = true;
      else mustUnproven = true;
    }
  }
  const score = known > 0 ? Math.round((100 * earned) / known) : 0;
  const confidence = total > 0 ? known / total : 0;
  const standing = score * (0.6 + 0.4 * confidence);
  // What they could reach if every unresolved claim held.
  const potential = total > 0 ? (100 * (earned + unknownWeight)) / total : 0;

  let band: Band;
  if (mustMissing || (confidence >= 0.5 && score < BAR)) band = "below_bar";
  else if (!mustUnproven && confidence >= 0.75 && openContradictions === 0) band = "verified";
  else band = "needs_verification";

  return { score, confidence, standing, potential, pointsEarned: earned, pointsAvailable: known, pointsTotal: total, mustMet, mustTotal, band };
}

export const contribution = (weight: number, v: VerdictValue) => weight * (VALUE[v] ?? 0);


/**
 * For Verify: how many places each candidate would climb if their unresolved
 * claims held, against everyone else's current standing.
 */
export function placesAtStake(rows: { id: string; standing: number; potential: number }[]) {
  const sorted = [...rows].sort((a, b) => b.standing - a.standing);
  return new Map(
    rows.map((r) => {
      const now = sorted.findIndex((s) => s.id === r.id) + 1;
      const could = sorted.filter((s) => s.id !== r.id && s.standing > r.potential).length + 1;
      return [r.id, { now, could, stake: Math.max(0, now - could) }];
    }),
  );
}
