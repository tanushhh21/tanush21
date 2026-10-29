/**
 * Groq, used when there is a GROQ_API_KEY and no ANTHROPIC_API_KEY. Groq speaks
 * the OpenAI chat format, so this is plain fetch: one structured call (JSON
 * checked against the same zod schemas as Claude's) and one chat turn with
 * tools.
 *
 * Groq's free tier allows about 8,000 tokens a minute per model, so a
 * rate-limited call waits and tries again, long inputs are trimmed to fit, and
 * quick extraction work goes to a smaller model with its own allowance.
 */
import { z } from "zod";
import type { AgentTool } from "@/lib/console/agent";
import type { Content } from "./claude";
import { AiError, type Effort } from "./errors";

const BASE = "https://api.groq.com/openai/v1";
export const GROQ_MODEL = process.env.WINNOW_GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_FAST_MODEL = process.env.WINNOW_GROQ_FAST_MODEL || "openai/gpt-oss-20b";

// About 4 characters a token. Leaves room for instructions and the answer under 8,000 tokens a minute.
const INPUT_CHARS = 18_000;
const TOOL_RESULT_CHARS = 6_000;

type Call = { id: string; type: "function"; function: { name: string; arguments: string } };
type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_calls?: Call[]; tool_call_id?: string };
type Reply = { model: string; choices: { message: { content: string | null; tool_calls?: Call[] }; finish_reason: string }[] };

class BadRequest extends AiError {}

const reasoning = (model: string, effort: Effort) => (model.startsWith("openai/gpt-oss") ? { reasoning_effort: effort === "low" ? "low" : effort === "medium" ? "medium" : "high" } : {});

async function complete(task: string, body: Record<string, unknown>): Promise<Reply> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      if (attempt < 3) continue;
      throw new AiError(`${task}: could not reach the AI service.`, "api");
    }
    if (res.ok) return (await res.json()) as Reply;
    const detail = ((await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null)?.error;
    const wait = Number(res.headers.get("retry-after")) || 2 ** attempt * 2;
    if (res.status === 429 && wait > 45) throw new AiError(`${task}: the free AI allowance is used up for now. Try again in ${Math.ceil(wait / 60)} minutes.`, "api");
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, Math.min(wait, 45) * 1000));
      continue;
    }
    // The model sometimes writes JSON that misses the schema; Groq rejects it, and a second try usually lands.
    if (res.status === 400 && detail?.code === "json_validate_failed" && attempt < 2) continue;
    const message = `${task}: the AI service returned ${res.status}${detail?.message ? ` (${detail.message.slice(0, 200)})` : ""}.`;
    throw res.status === 400 ? new BadRequest(message, "api") : new AiError(message, "api");
  }
}

/** The zod schema as JSON Schema, without the parts strict mode does not take. */
function jsonSchema(schema: z.ZodType) {
  const strip = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(strip);
    if (!o || typeof o !== "object") return o;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === "$schema") continue;
      // .int() adds the safe-integer bounds; they say nothing useful.
      if ((k === "minimum" || k === "maximum") && Math.abs(v as number) >= Number.MAX_SAFE_INTEGER) continue;
      out[k] = strip(v);
    }
    return out;
  };
  return strip(z.toJSONSchema(schema)) as Record<string, unknown>;
}

const fit = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n\n[Trimmed: the rest was too long to read in one go.]` : text);

export async function groqStructured<S extends z.ZodType>(o: {
  task: string;
  schema: S;
  instructions: string;
  context?: string;
  input: Content;
  effort?: Effort;
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; costUsd: number; model: string }> {
  if (typeof o.input !== "string" && o.input.some((b) => b.type !== "text"))
    throw new AiError(`${o.task}: this file is a scan with no text, which the current AI cannot read. Ask for a text PDF or a Word file.`, "unsupported");
  const input = typeof o.input === "string" ? o.input : o.input.map((b) => (b.type === "text" ? b.text : "")).join("\n\n");
  const effort = o.effort ?? "medium";
  const model = effort === "low" ? GROQ_FAST_MODEL : GROQ_MODEL;
  const body = (strict: boolean) => ({
    model,
    messages: [
      { role: "system", content: o.context ? `${o.instructions}\n\n${o.context}` : o.instructions },
      { role: "user", content: fit(input, INPUT_CHARS) },
    ],
    max_completion_tokens: o.maxTokens ?? 16000,
    response_format: { type: "json_schema", json_schema: { name: "answer", strict, schema: jsonSchema(o.schema) } },
    ...reasoning(model, effort),
  });

  let res: Reply;
  try {
    res = await complete(o.task, body(true));
  } catch (e) {
    // A schema strict mode cannot take: ask again without it and check the answer here.
    if (!(e instanceof BadRequest) || !/schema|strict/i.test(e.message)) throw e;
    res = await complete(o.task, body(false));
  }
  const choice = res.choices[0];
  if (choice?.finish_reason === "length") throw new AiError(`${o.task}: the answer was cut off.`, "truncated");
  let raw: unknown;
  try {
    raw = JSON.parse(choice?.message.content ?? "");
  } catch {
    throw new AiError(`${o.task}: the answer was not readable.`, "unparsed");
  }
  const parsed = o.schema.safeParse(raw);
  if (!parsed.success) throw new AiError(`${o.task}: the answer did not match the expected shape.`, "unparsed");
  // Groq's free tier costs nothing.
  return { data: parsed.data as z.infer<S>, costUsd: 0, model: res.model };
}

/** One chat turn: the model calls tools until it has an answer, at most ten rounds. */
export async function groqAgent(o: {
  instructions: string;
  context: string;
  history: { role: "user" | "assistant"; content: string }[];
  tools: AgentTool[];
}): Promise<{ reply: string; costUsd: number; model: string }> {
  const messages: Msg[] = [
    { role: "system", content: `${o.instructions}\n\n${fit(o.context, INPUT_CHARS)}` },
    // Older turns are shortened so the whole request stays inside the free allowance.
    ...o.history.map((t, i) => ({ role: t.role, content: i === o.history.length - 1 ? fit(t.content, INPUT_CHARS) : fit(t.content, 1500) })),
  ];
  const tools = o.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: jsonSchema(t.schema) } }));

  let model = GROQ_MODEL;
  for (let round = 0; round < 10; round++) {
    const res = await complete("Chat", { model: GROQ_MODEL, messages, tools, max_completion_tokens: 8000, ...reasoning(GROQ_MODEL, "medium") });
    model = res.model;
    const m = res.choices[0]?.message;
    if (!m?.tool_calls?.length) return { reply: m?.content?.trim() || "Done.", costUsd: 0, model };
    messages.push({ role: "assistant", content: m.content ?? "", tool_calls: m.tool_calls });
    for (const call of m.tool_calls) {
      const tool = o.tools.find((t) => t.name === call.function.name);
      let result: string;
      if (!tool) result = `There is no tool called ${call.function.name}.`;
      else {
        let args: unknown = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = null;
        }
        const input = tool.schema.safeParse(args);
        if (!input.success) result = `The input did not fit: ${input.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}. Try again.`;
        else {
          try {
            result = await tool.run(input.data as never);
          } catch (e) {
            result = `That did not work: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: fit(result, TOOL_RESULT_CHARS) });
    }
  }
  return { reply: "That took more steps than I can take in one go. Try asking for one thing at a time.", costUsd: 0, model };
}
