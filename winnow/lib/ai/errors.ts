/** Errors from the AI, whichever service answers. "unsupported" means a retry cannot help. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "refusal" | "truncated" | "unparsed" | "not_configured" | "unsupported" | "api",
  ) {
    super(message);
  }
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
