/**
 * Every call Winnow makes to Claude goes through structured(): a schema-checked
 * result, a server-side fallback if the model declines, the stable part of the
 * prompt cached, and the cost of the call returned so it can be shown.
 *
 * Locally, WINNOW_FAKE_AI=1 swaps in deterministic stand-ins (lib/ai/fake.ts)
 * so the whole product can be exercised without spending money. They can
 * never run on Vercel.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = process.env.WINNOW_MODEL || "claude-opus-5-5";

export const fakeAi = () => process.env.WINNOW_FAKE_AI === "1" && !process.env.VERCEL;
export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY) || fakeAi();

/** US dollars per million tokens. Unknown models are costed as Opus. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "refusal" | "truncated" | "unparsed" | "not_configured" | "api",
  ) {
    super(message);
  }
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function costOf(model: string, u: Usage) {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  return (
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1_000_000
  );
}

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ maxRetries: 3 }));

export type Content = string | Anthropic.Beta.BetaContentBlockParam[];

/**
 * One structured call. `instructions` and `context` form the system prompt;
 * both are stable across many calls (the rubric for every CV of a role), so
 * they are cached. `input` is what changes per call.
 */
export async function structured<S extends z.ZodType>(o: {
  task: string;
  schema: S;
  instructions: string;
  context?: string;
  input: Content;
  effort?: Effort;
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; costUsd: number; model: string }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiError("The AI is not set up yet (ANTHROPIC_API_KEY).", "not_configured");

  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: o.instructions }];
  if (o.context) system.push({ type: "text", text: o.context });
  system[system.length - 1].cache_control = { type: "ephemeral" };

  let res;
  try {
    res = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: o.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: o.input }],
      output_config: { effort: o.effort ?? "medium", format: betaZodOutputFormat(o.schema) },
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new AiError(`${o.task}: the AI service returned ${e.status ?? "an error"}.`, "api");
    throw e;
  }

  const costUsd = costOf(res.model, res.usage);
  if (res.stop_reason === "refusal") throw new AiError(`${o.task}: the request was declined.`, "refusal");
  if (res.stop_reason === "max_tokens") throw new AiError(`${o.task}: the answer was cut off.`, "truncated");
  if (res.parsed_output == null) throw new AiError(`${o.task}: the answer did not match the expected shape.`, "unparsed");
  return { data: res.parsed_output as z.infer<S>, costUsd, model: res.model };
}
