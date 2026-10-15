import { profileSite } from "@/lib/prompts";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.url) return Response.json({ error: "url is required" }, { status: 400 });
    const profile = await profileSite({
      url: body.url,
      language: body.language,
      competitors: body.competitors,
      promptCount: body.promptCount,
    });
    return Response.json(profile);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
