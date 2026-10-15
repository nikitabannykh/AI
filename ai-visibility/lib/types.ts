// Shared domain types for the AI Visibility engine.

export type Brand = {
  name: string;        // "Octopus Newsroom"
  domain: string;      // "octopus-news.com" (bare, no scheme)
  aliases?: string[];  // ["Octopus", "Octopus NRCS"]
};

export type PromptCategory =
  | "category"      // "what is a newsroom computer system"
  | "best"          // "best NRCS for broadcasters"
  | "alternatives"  // "ENPS alternatives"
  | "comparison"    // "iNEWS vs Dalet"
  | "use_case"      // "newsroom system for a mid-size TV station"
  | "brand";        // "is Octopus Newsroom any good"

export type Prompt = {
  id: string;
  text: string;
  category: PromptCategory;
};

export type Setup = {
  brand: Brand;
  competitors: Brand[];
  prompts: Prompt[];
  market?: string;      // "US" | "EU" | ... (passed to web_search user_location)
  language?: string;    // "en"
  industry?: string;    // free text, detected from the site
};

export type Citation = {
  url: string;
  domain: string;
  title?: string;
};

export type BrandMention = {
  brand: string;          // matches Brand.name
  mentioned: boolean;
  position: number | null; // 1 = first brand named, null if not mentioned
  recommended: boolean;    // explicitly recommended / in a "top picks" list
  sentiment: "positive" | "neutral" | "negative" | "none";
  snippet?: string;        // short quote of how it was described
};

export type PromptResult = {
  promptId: string;
  promptText: string;
  category: PromptCategory;
  answer: string;               // plain text of Claude's answer
  citations: Citation[];        // cited sources (from text block citations)
  searchResults: Citation[];    // everything web search surfaced, cited or not
  searchQueries: string[];      // queries Claude actually ran
  mentions: BrandMention[];     // one entry per brand (own + competitors)
  otherBrands: string[];        // brands named that are not in the setup
  usage: { inputTokens: number; outputTokens: number; searches: number };
  error?: string;
};

export type BrandScore = {
  brand: string;
  domain: string;
  mentionRate: number;      // 0..1 share of prompts where mentioned
  recommendRate: number;    // 0..1 share of prompts where recommended
  avgPosition: number | null;
  citationShare: number;    // 0..1 share of all citations pointing to its domain
  citedPrompts: number;     // prompts where its own domain was cited
  sentiment: { positive: number; neutral: number; negative: number };
  byCategory: Record<PromptCategory, { mentioned: number; total: number }>;
};

export type SourceStat = {
  domain: string;
  citations: number;        // how many times cited across prompts
  prompts: number;          // in how many prompts
  brandsSupported: string[];// which brands were mentioned in prompts where this source was cited
  isOwn: boolean;
  isCompetitor: string | null; // competitor name if it's their domain
  sampleUrls: string[];
};

export type Recommendation = {
  priority: "high" | "medium" | "low";
  area: "content" | "third_party" | "technical" | "positioning" | "comparison";
  title: string;
  why: string;        // evidence-based reasoning from the run
  action: string;     // concrete thing to do
  evidence: string[]; // prompt texts / domains backing this
};

export type Report = {
  generatedAt: string;
  setup: Setup;
  results: PromptResult[];
  scores: BrandScore[];
  sources: SourceStat[];
  visibilityScore: number; // 0..100 composite for the own brand
  summary: string;
  recommendations: Recommendation[];
  totalUsage: { inputTokens: number; outputTokens: number; searches: number };
};
