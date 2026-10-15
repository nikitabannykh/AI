# AI Visibility Audit

Measures how a brand shows up when buyers ask **Claude** (with web search) about its product category, compares it with competitors, and explains what to fix and why.

Enter a site URL → the app reads the homepage, names the category the way buyers phrase it, proposes competitors and ~20 realistic buyer prompts → each prompt is sent to Claude exactly as a user would type it → a second model extracts which brands were named, in what order, with what sentiment, and which sources were cited → a scoring layer computes share of voice and citation share → an analyst model writes an evidence-based fix list.

## Run locally

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm install
npm run dev                  # http://localhost:3000
```

Deploy: push to GitHub, import in Vercel, set `ANTHROPIC_API_KEY`. No database needed for v1 — the last report is kept in the browser (`localStorage`) and can be exported as JSON.

## How it works

```
/api/profile  POST {url, language, competitors?, promptCount?}
              → fetch homepage → Claude (Haiku, structured) → category, competitors, prompts

/api/run      POST {prompt, brand, competitors, market?}
              → Claude (Sonnet) + web_search tool, NO system prompt   ← the "user asking Claude" simulation
              → collect: answer text, citations, every search result, search queries
              → Claude (Haiku, structured): per-brand mentioned / position / recommended / sentiment
              one prompt per request so each call stays inside Vercel's function limits;
              the browser runs 3 in parallel

/api/report   POST {setup, results}
              → lib/score.ts: mention rate, recommend rate, avg position, citation share, by category,
                              source table (which domains carry which brands)
              → Claude (Sonnet, structured): summary + 8-12 prioritised recommendations with evidence
```

Key files:

| File | Role |
|---|---|
| `lib/types.ts` | all domain types (`Setup`, `PromptResult`, `BrandScore`, `SourceStat`, `Report`) |
| `lib/anthropic.ts` | client, model config, `structured()` helper (forced tool-use → JSON) |
| `lib/prompts.ts` | site profiling + prompt generation |
| `lib/run.ts` | run one prompt through Claude with web search, extract mentions |
| `lib/score.ts` | pure scoring functions (no API calls) |
| `lib/recommend.ts` | builds the evidence digest and asks the analyst model |
| `components/*` | 4-step UI: Site → Prompts & competitors → Run → Report |

## Visibility score (0–100)

Half absolute, half relative to the best competitor:

- absolute = 0.35·mentionRate + 0.30·recommendRate + 0.20·min(1, 3·citationShare) + 0.15·positionScore
- relative = 0.4·(mention / bestMention) + 0.4·(recommend / bestRecommend) + 0.2·(citations / bestCitations)

Being *recommended* and having *your own site cited as a source* are weighted higher than a passing mention, because that's what moves an AI answer from "lists you" to "sends people to you".

## Cost per audit (rough)

20 prompts × (1 answer with ≤5 searches + 1 extraction) + 1 profile + 1 analyst call ≈ 60–100 web searches (billed at $10 per 1,000) plus roughly 300–500k input tokens, mostly search results. Set `max_uses` lower in `lib/run.ts` to cut cost.

## Roadmap

- [ ] Persist runs (Postgres/Supabase) + re-run on schedule → trend lines
- [ ] Add ChatGPT (Responses API `web_search`) and Gemini (grounding) engines behind the same `PromptResult` shape
- [ ] Crawl the brand's site and competitor sites so recommendations can point at concrete missing pages
- [ ] Multi-tenant auth, shareable report links, PDF export
- [ ] Prompt library per industry
