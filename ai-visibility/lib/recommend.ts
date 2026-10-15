import { ANALYST_MODEL, structured } from "./anthropic";
import type { BrandScore, PromptResult, Recommendation, Setup, SourceStat } from "./types";

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

/** Compact, evidence-rich digest of the run for the analyst model. */
function buildDigest(setup: Setup, results: PromptResult[], scores: BrandScore[], sources: SourceStat[]) {
  const own = setup.brand.name;
  const lines: string[] = [];

  lines.push(`BRAND: ${own} (${setup.brand.domain})`);
  lines.push(`COMPETITORS: ${setup.competitors.map((c) => `${c.name} (${c.domain})`).join(", ")}`);
  lines.push("");
  lines.push("SCOREBOARD (mention rate / recommend rate / avg position / citation share / prompts where own site cited):");
  for (const s of [...scores].sort((a, b) => b.mentionRate - a.mentionRate)) {
    lines.push(
      `- ${s.brand}: ${pct(s.mentionRate)} / ${pct(s.recommendRate)} / ${s.avgPosition?.toFixed(1) ?? "-"} / ${pct(s.citationShare)} / ${s.citedPrompts}`,
    );
  }
  lines.push("");
  lines.push("BY CATEGORY (own brand mentioned / total):");
  const ownScore = scores.find((s) => s.brand === own);
  if (ownScore) {
    for (const [cat, v] of Object.entries(ownScore.byCategory)) {
      if (v.total) lines.push(`- ${cat}: ${v.mentioned}/${v.total}`);
    }
  }
  lines.push("");
  lines.push("TOP CITED SOURCES (domain: citations, prompts, brands mentioned alongside):");
  for (const s of sources.slice(0, 25)) {
    const tag = s.isOwn ? " [OWN SITE]" : s.isCompetitor ? ` [COMPETITOR SITE: ${s.isCompetitor}]` : "";
    lines.push(`- ${s.domain}${tag}: ${s.citations} cites, ${s.prompts} prompts, with: ${s.brandsSupported.join(", ") || "-"}; e.g. ${s.sampleUrls.slice(0, 2).join(" ")}`);
  }
  lines.push("");
  lines.push("PROMPT-LEVEL DETAIL:");
  for (const r of results) {
    if (r.error) {
      lines.push(`[${r.promptId}] "${r.promptText}" — ERROR ${r.error}`);
      continue;
    }
    const m = r.mentions.filter((x) => x.mentioned);
    const ownM = r.mentions.find((x) => x.brand === own);
    lines.push(
      `[${r.promptId}] (${r.category}) "${r.promptText}"\n  queries: ${r.searchQueries.join(" | ") || "-"}\n  brands named: ${m.map((x) => `${x.brand}#${x.position}${x.recommended ? "*" : ""}`).join(", ") || "none"}; others: ${r.otherBrands.join(", ") || "-"}\n  ${own}: ${ownM?.mentioned ? `mentioned (${ownM.sentiment}) "${ownM.snippet ?? ""}"` : "NOT mentioned"}\n  cited: ${r.citations.map((c) => c.domain).join(", ") || "-"}`,
    );
  }
  return lines.join("\n");
}

export async function recommend(setup: Setup, results: PromptResult[], scores: BrandScore[], sources: SourceStat[]) {
  const digest = buildDigest(setup, results, scores, sources);

  const { data, usage } = await structured<{ summary: string; recommendations: Recommendation[] }>({
    model: ANALYST_MODEL,
    toolName: "visibility_recommendations",
    description: "Executive summary and prioritised recommendations for improving AI visibility.",
    maxTokens: 6000,
    system: `You are a senior GEO (generative engine optimisation) consultant. You receive the raw results of a brand
visibility audit run against Claude with web search. Your job is to explain WHY competitors are more visible and
WHAT to change, grounded strictly in the evidence (which sources were cited, which prompts the brand missed, how it
was framed). Do not invent facts about the brand's website you cannot see in the digest.

Think in terms of how answer engines work: they search the web, read a handful of pages, and name the brands those
pages name. Visibility therefore comes from (1) third-party pages that list/compare vendors (G2, Capterra, Wikipedia,
industry press, "best X" articles, Reddit), (2) the brand's own pages being retrievable and quotable for the exact
questions buyers ask (clear category naming, comparison pages, "alternatives to" pages, FAQ-style definitions),
(3) consistent naming/aliases so the model links brand to category, (4) technical retrievability.

Output: a 4-6 sentence executive summary (what the score means, the biggest gap, the single most important fix), then
8-12 recommendations. Each must cite evidence from the digest (prompt ids or domains). Prioritise by expected impact.
Be concrete: name the page to create, the directory to get listed on, the comparison to publish. Write in ${setup.language ?? "English"}.`,
    user: digest,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        recommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              priority: { type: "string", enum: ["high", "medium", "low"] },
              area: { type: "string", enum: ["content", "third_party", "technical", "positioning", "comparison"] },
              title: { type: "string" },
              why: { type: "string" },
              action: { type: "string" },
              evidence: { type: "array", items: { type: "string" } },
            },
            required: ["priority", "area", "title", "why", "action", "evidence"],
          },
        },
      },
      required: ["summary", "recommendations"],
    },
  });

  return { ...data, usage, digest };
}
