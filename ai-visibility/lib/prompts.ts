import { WORKER_MODEL, structured, normalizeDomain } from "./anthropic";
import { fetchSiteText } from "./site";
import type { Brand, Prompt, PromptCategory } from "./types";

export type SiteProfile = {
  brandName: string;
  industry: string;
  productCategory: string;      // the generic noun buyers use: "newsroom computer system (NRCS)"
  categoryAliases: string[];    // ["NRCS", "newsroom software", "news production system"]
  targetBuyers: string[];       // ["head of news", "broadcast CTO"]
  suggestedCompetitors: Brand[];
  prompts: Prompt[];
};

const CATEGORIES: PromptCategory[] = ["category", "best", "alternatives", "comparison", "use_case", "brand"];

/**
 * Reads the site and asks Claude (no web search — this is cheap and deterministic enough)
 * to describe the product category and draft the prompt set buyers would ask an AI assistant.
 */
export async function profileSite(opts: {
  url: string;
  language?: string;
  competitors?: Brand[];
  promptCount?: number;
}): Promise<SiteProfile> {
  const text = await fetchSiteText(opts.url);
  const domain = normalizeDomain(opts.url);
  const n = opts.promptCount ?? 20;
  const known = (opts.competitors ?? []).map((c) => c.name).join(", ");

  const { data } = await structured<SiteProfile>({
    model: WORKER_MODEL,
    toolName: "site_profile",
    description: "Return the structured profile of the website and a prompt set.",
    maxTokens: 6000,
    system: `You are an AI-search (GEO) analyst. You are given the homepage text of a B2B/B2C website.
Your job: identify what the company sells, name the generic product category the way buyers phrase it,
list its competitors, and write the questions a real buyer would type into an AI assistant (ChatGPT/Claude)
when researching this category. These prompts are used to measure whether the brand gets mentioned.

Rules for prompts:
- Write in ${opts.language ?? "English"}.
- Never mention the brand itself except in the "brand" category (max 2 of those).
- Mix categories: category (what is X / how does X work), best (best X for Y), alternatives (<competitor> alternatives),
  comparison (<A> vs <B>, include the brand in at most 2 comparisons), use_case (X for <segment/need>), brand.
- Prompts must be realistic, specific to the industry, varied in length (5–20 words), no duplicates.
- Produce exactly ${n} prompts, ids p1..p${n}.`,
    user: `Website: ${domain}\n${known ? `Known competitors (keep them, add more if obvious): ${known}\n` : ""}\nHomepage text:\n"""\n${text}\n"""`,
    schema: {
      type: "object",
      properties: {
        brandName: { type: "string" },
        industry: { type: "string" },
        productCategory: { type: "string" },
        categoryAliases: { type: "array", items: { type: "string" } },
        targetBuyers: { type: "array", items: { type: "string" } },
        suggestedCompetitors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              domain: { type: "string", description: "bare domain, e.g. dalet.com" },
              aliases: { type: "array", items: { type: "string" } },
            },
            required: ["name", "domain"],
          },
        },
        prompts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              category: { type: "string", enum: CATEGORIES },
            },
            required: ["id", "text", "category"],
          },
        },
      },
      required: ["brandName", "industry", "productCategory", "categoryAliases", "targetBuyers", "suggestedCompetitors", "prompts"],
    },
  });

  data.suggestedCompetitors = data.suggestedCompetitors.map((c) => ({
    ...c,
    domain: normalizeDomain(c.domain),
  }));
  data.prompts = data.prompts.map((p, i) => ({ ...p, id: p.id || `p${i + 1}` }));
  return data;
}
