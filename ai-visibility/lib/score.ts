import type { Brand, BrandScore, PromptCategory, PromptResult, SourceStat } from "./types";

const CATEGORIES: PromptCategory[] = ["category", "best", "alternatives", "comparison", "use_case", "brand"];

function emptyByCategory() {
  return Object.fromEntries(CATEGORIES.map((c) => [c, { mentioned: 0, total: 0 }])) as BrandScore["byCategory"];
}

export function scoreBrands(results: PromptResult[], brands: Brand[]): BrandScore[] {
  const ok = results.filter((r) => !r.error);
  const totalCitations = ok.reduce((n, r) => n + r.citations.length, 0) || 1;

  return brands.map((b) => {
    const byCategory = emptyByCategory();
    let mentioned = 0;
    let recommended = 0;
    let citedPrompts = 0;
    let brandCitations = 0;
    const positions: number[] = [];
    const sentiment = { positive: 0, neutral: 0, negative: 0 };

    for (const r of ok) {
      const m = r.mentions.find((x) => x.brand === b.name);
      byCategory[r.category].total++;
      if (m?.mentioned) {
        mentioned++;
        byCategory[r.category].mentioned++;
        if (m.recommended) recommended++;
        if (m.position) positions.push(m.position);
        if (m.sentiment !== "none") sentiment[m.sentiment]++;
      }
      const own = r.citations.filter((c) => sameDomain(c.domain, b.domain));
      if (own.length) citedPrompts++;
      brandCitations += own.length;
    }

    const n = ok.length || 1;
    return {
      brand: b.name,
      domain: b.domain,
      mentionRate: mentioned / n,
      recommendRate: recommended / n,
      avgPosition: positions.length ? positions.reduce((a, c) => a + c, 0) / positions.length : null,
      citationShare: brandCitations / totalCitations,
      citedPrompts,
      sentiment,
      byCategory,
    };
  });
}

export function sameDomain(a: string, b: string) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/** Which third-party sources Claude leans on, and which brands they "carry". */
export function scoreSources(results: PromptResult[], own: Brand, competitors: Brand[]): SourceStat[] {
  const map = new Map<string, SourceStat & { _prompts: Set<string>; _brands: Set<string>; _urls: Set<string> }>();

  for (const r of results) {
    if (r.error) continue;
    const mentionedHere = r.mentions.filter((m) => m.mentioned).map((m) => m.brand);
    for (const c of r.citations) {
      const key = c.domain;
      const s =
        map.get(key) ??
        (() => {
          const comp = competitors.find((x) => sameDomain(c.domain, x.domain));
          const stat = {
            domain: key,
            citations: 0,
            prompts: 0,
            brandsSupported: [],
            isOwn: sameDomain(c.domain, own.domain),
            isCompetitor: comp ? comp.name : null,
            sampleUrls: [],
            _prompts: new Set<string>(),
            _brands: new Set<string>(),
            _urls: new Set<string>(),
          };
          map.set(key, stat);
          return stat;
        })();
      s.citations++;
      s._prompts.add(r.promptId);
      mentionedHere.forEach((b) => s._brands.add(b));
      s._urls.add(c.url);
    }
  }

  return [...map.values()]
    .map((s) => ({
      domain: s.domain,
      citations: s.citations,
      prompts: s._prompts.size,
      brandsSupported: [...s._brands],
      isOwn: s.isOwn,
      isCompetitor: s.isCompetitor,
      sampleUrls: [...s._urls].slice(0, 5),
    }))
    .sort((a, b) => b.citations - a.citations);
}

/**
 * Composite 0..100 for the own brand. Weighted so that being *recommended* and being *cited*
 * (your own site used as a source) matter more than a passing mention.
 */
export function visibilityScore(own: BrandScore, all: BrandScore[]): number {
  const bestMention = Math.max(...all.map((s) => s.mentionRate), 0.0001);
  const bestRecommend = Math.max(...all.map((s) => s.recommendRate), 0.0001);
  const bestCite = Math.max(...all.map((s) => s.citationShare), 0.0001);
  const posScore = own.avgPosition ? Math.max(0, 1 - (own.avgPosition - 1) / 5) : 0;

  const absolute = 0.35 * own.mentionRate + 0.3 * own.recommendRate + 0.2 * own.citationShare * 3 + 0.15 * posScore;
  const relative =
    0.4 * (own.mentionRate / bestMention) + 0.4 * (own.recommendRate / bestRecommend) + 0.2 * (own.citationShare / bestCite);
  return Math.round(100 * Math.min(1, 0.5 * Math.min(1, absolute) + 0.5 * relative));
}
