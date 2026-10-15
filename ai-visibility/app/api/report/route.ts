import { scoreBrands, scoreSources, visibilityScore } from "@/lib/score";
import { recommend } from "@/lib/recommend";
import type { PromptResult, Report, Setup } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { setup, results } = (await req.json()) as { setup: Setup; results: PromptResult[] };
    if (!setup?.brand || !Array.isArray(results)) {
      return Response.json({ error: "setup and results are required" }, { status: 400 });
    }
    const brands = [setup.brand, ...setup.competitors];
    const scores = scoreBrands(results, brands);
    const sources = scoreSources(results, setup.brand, setup.competitors);
    const own = scores.find((s) => s.brand === setup.brand.name)!;
    const score = visibilityScore(own, scores);
    const rec = await recommend(setup, results, scores, sources);

    const totalUsage = results.reduce(
      (acc, r) => ({
        inputTokens: acc.inputTokens + r.usage.inputTokens,
        outputTokens: acc.outputTokens + r.usage.outputTokens,
        searches: acc.searches + r.usage.searches,
      }),
      { inputTokens: rec.usage.inputTokens, outputTokens: rec.usage.outputTokens, searches: 0 },
    );

    const report: Report = {
      generatedAt: new Date().toISOString(),
      setup,
      results,
      scores,
      sources,
      visibilityScore: score,
      summary: rec.summary,
      recommendations: rec.recommendations,
      totalUsage,
    };
    return Response.json(report);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
