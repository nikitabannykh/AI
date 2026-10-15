import { runPrompt } from "@/lib/run";

// One prompt per request so each call stays well inside serverless limits.
// The browser orchestrates the loop and keeps the results.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, brand, competitors, market, maxSearches } = body ?? {};
    if (!prompt?.text || !brand?.name) {
      return Response.json({ error: "prompt and brand are required" }, { status: 400 });
    }
    const result = await runPrompt({ prompt, brand, competitors: competitors ?? [], market, maxSearches });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
