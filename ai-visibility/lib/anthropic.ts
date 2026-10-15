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
  // Forced tool_choice ("tool"/"any") is not supported on current models, so we ask for the
  // tool call in the system prompt and fall back to parsing JSON out of the text if needed.
  const instruction = `\n\nRespond ONLY by calling the \`${opts.toolName}\` tool with the complete result. Do not write any prose.`;
  const res = await anthropic().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: (opts.system ?? "") + instruction,
    messages: [{ role: "user", content: opts.user }],
    tools: [
      {
        name: opts.toolName,
        description: opts.description,
        input_schema: opts.schema as Anthropic.Tool["input_schema"],
      },
    ],
    tool_choice: { type: "auto" },
  });
  const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  const block = res.content.find((b) => b.type === "tool_use");
  if (block && block.type === "tool_use") return { data: block.input as T, usage };

  // Fallback: model answered in text — try to find a JSON object in it.
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  if (match) {
    try {
      return { data: JSON.parse(match[1]) as T, usage };
    } catch {
      /* fall through */
    }
  }
  throw new Error(`No structured output returned (model replied with text: ${text.slice(0, 200)})`);
}
