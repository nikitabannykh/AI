// Fetch a site's homepage and turn it into plain text that fits in a prompt.

export async function fetchSiteText(url: string, maxChars = 8000): Promise<string> {
  const target = url.includes("://") ? url : `https://${url}`;
  const res = await fetch(target, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; AIVisibilityBot/0.1; +https://example.com)",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Site fetch failed: ${res.status}`);
  const html = await res.text();
  return htmlToText(html).slice(0, maxChars);
}

export function htmlToText(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const desc =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html)?.[1] ??
    "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return [title && `TITLE: ${title}`, desc && `DESCRIPTION: ${desc}`, body]
    .filter(Boolean)
    .join("\n");
}
