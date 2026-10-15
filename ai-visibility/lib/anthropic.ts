import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Model used to simulate "a user asking Claude". Should be the same tier real users talk to.
export const ANSWER_MODEL = process.env.ANSWER_MODEL ?? "claude-sonnet-5-5";
// Cheaper model for structured extraction and prompt generation.
export const WORKER_MODEL = process.env.WORKER_MODEL ?? "claude-haiku-5-5";
// Stronger model for the final recommendations.
export const ANALYST_MODEL = process.env.ANALYST_MODEL ?? "claude-sonnet-5-5";

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  }
}

export function normalizeDomain(d: string): string {
  return domainOf(d.includes("://") ? d : `https://${d}`);
}

/** Call Claude with a single tool and force it to return that tool's input as structured JSON. */
export async function structured<T>(opts: {
  model: string;
  system?: string;
  user: string;
  toolName: string;
  description: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<{ data: T; usage: { inputTokens: number; outputTokens: number } }> {
  const res = await anthropic().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    tools: [
      {
        name: opts.toolName,
        description: opts.description,
        input_schema: opts.schema as Anthropic.Tool["input_schema"],
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("No structured output returned");
  return {
    data: block.input as T,
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  };
}
