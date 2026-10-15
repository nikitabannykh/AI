import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, ANSWER_MODEL, WORKER_MODEL, domainOf, structured } from "./anthropic";
import type { Brand, BrandMention, Citation, Prompt, PromptResult } from "./types";

type RunOpts = {
  prompt: Prompt;
  brand: Brand;
  competitors: Brand[];
  market?: string;    // ISO country code, e.g. "US"
  maxSearches?: number;
};

/**
 * Step 1: ask Claude the prompt the way a real user would — no steering system prompt,
 * web search enabled, so the answer and the sources mirror what claude.ai would produce.
 */
async function askClaude(prompt: Prompt, market?: string, maxSearches = 5) {
  const client = anthropic();
  const tool: Anthropic.Messages.WebSearchTool20250305 = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: maxSearches,
    ...(market
      ? { user_location: { type: "approximate" as const, country: market } }
      : {}),
  };

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt.text }];
  let searches = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const content: Anthropic.ContentBlock[] = [];

  // Server-side loop: web search may pause the turn; resend the assistant message unchanged.
  for (let i = 0; i < 6; i++) {
    const res = await client.messages.create({
      model: ANSWER_MODEL,
      max_tokens: 2500,
      messages,
      tools: [tool],
    });
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;
    searches += res.usage.server_tool_use?.web_search_requests ?? 0;
    content.push(...res.content);
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    break;
  }

  const answerParts: string[] = [];
  const citations = new Map<string, Citation>();
  const searchResults = new Map<string, Citation>();
  const queries: string[] = [];

  for (const block of content) {
    if (block.type === "text") {
      answerParts.push(block.text);
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location") {
          citations.set(c.url, { url: c.url, domain: domainOf(c.url), title: c.title ?? undefined });
        }
      }
    } else if (block.type === "server_tool_use" && block.name === "web_search") {
      const q = (block.input as { query?: string })?.query;
      if (q) queries.push(q);
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === "web_search_result") {
          searchResults.set(r.url, { url: r.url, domain: domainOf(r.url), title: r.title });
        }
      }
    }
  }

  return {
    answer: answerParts.join("").trim(),
    citations: [...citations.values()],
    searchResults: [...searchResults.values()],
    queries,
    usage: { inputTokens, outputTokens, searches },
  };
}

/**
 * Step 2: structured extraction — which brands were named, where, how.
 * Done by a separate cheap call so the answer itself is never influenced.
 */
async function extractMentions(answer: string, brands: Brand[]) {
  const list = brands
    .map((b) => `- ${b.name}${b.aliases?.length ? ` (aliases: ${b.aliases.join(", ")})` : ""}`)
    .join("\n");

  const { data, usage } = await structured<{ mentions: BrandMention[]; otherBrands: string[] }>({
    model: WORKER_MODEL,
    toolName: "mention_report",
    description: "Report which tracked brands appear in the answer and how they are framed.",
    maxTokens: 3000,
    system: `You analyse an AI assistant's answer for brand visibility. Be strict and literal: a brand is "mentioned"
only if the answer actually names it (or an alias). "position" is the order in which tracked brands first appear
(1 = earliest), null if not mentioned. "recommended" is true only if the answer explicitly recommends it, lists it as a
top/best pick, or suggests it as the answer to the user's need. Sentiment reflects how the answer frames the brand
("none" if not mentioned). "snippet" is a <=25-word verbatim fragment describing the brand, or omitted.
Also list other product/company brands in the same category that are named but not tracked.`,
    user: `Tracked brands:\n${list}\n\nAnswer:\n"""\n${answer}\n"""`,
    schema: {
      type: "object",
      properties: {
        mentions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              brand: { type: "string", enum: brands.map((b) => b.name) },
              mentioned: { type: "boolean" },
              position: { type: ["integer", "null"] },
              recommended: { type: "boolean" },
              sentiment: { type: "string", enum: ["positive", "neutral", "negative", "none"] },
              snippet: { type: "string" },
            },
            required: ["brand", "mentioned", "position", "recommended", "sentiment"],
          },
        },
        otherBrands: { type: "array", items: { type: "string" } },
      },
      required: ["mentions", "otherBrands"],
    },
  });

  // Guarantee one entry per tracked brand even if the model skipped some.
  const byName = new Map(data.mentions.map((m) => [m.brand, m]));
  const mentions: BrandMention[] = brands.map(
    (b) =>
      byName.get(b.name) ?? {
        brand: b.name,
        mentioned: false,
        position: null,
        recommended: false,
        sentiment: "none",
      },
  );
  return { mentions, otherBrands: data.otherBrands ?? [], usage };
}

export async function runPrompt(opts: RunOpts): Promise<PromptResult> {
  const brands = [opts.brand, ...opts.competitors];
  const base = {
    promptId: opts.prompt.id,
    promptText: opts.prompt.text,
    category: opts.prompt.category,
  };
  try {
    const asked = await askClaude(opts.prompt, opts.market, opts.maxSearches);
    const extracted = await extractMentions(asked.answer, brands);
    return {
      ...base,
      answer: asked.answer,
      citations: asked.citations,
      searchResults: asked.searchResults,
      searchQueries: asked.queries,
      mentions: extracted.mentions,
      otherBrands: extracted.otherBrands,
      usage: {
        inputTokens: asked.usage.inputTokens + extracted.usage.inputTokens,
        outputTokens: asked.usage.outputTokens + extracted.usage.outputTokens,
        searches: asked.usage.searches,
      },
    };
  } catch (e) {
    return {
      ...base,
      answer: "",
      citations: [],
      searchResults: [],
      searchQueries: [],
      mentions: brands.map((b) => ({
        brand: b.name,
        mentioned: false,
        position: null,
        recommended: false,
        sentiment: "none" as const,
      })),
      otherBrands: [],
      usage: { inputTokens: 0, outputTokens: 0, searches: 0 },
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
