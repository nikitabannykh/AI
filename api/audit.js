export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"POST only"});
  const key=process.env.OPENAI_API_KEY;
  if(!key) return res.status(500).json({error:"OPENAI_API_KEY is not configured in Vercel."});
  const {hotel,query}=req.body||{};
  if(!hotel?.name||!hotel?.city||!query) return res.status(400).json({error:"hotel.name, hotel.city and query are required"});

  const model=process.env.OPENAI_MODEL||"gpt-6-luna";
  const prompt=`You are the AIHotel visibility analyst.

Your task is to simulate and analyze what a traveler-facing AI assistant would recommend for this hotel search.

Hotel:
${JSON.stringify(hotel)}

Traveler query:
"${query}"

Rules:
- Interpret generic queries in the hotel's city/country.
- Use web search before answering.
- Prefer current, public, reputable sources.
- Identify the exact hotel and do not confuse it with similarly named properties.
- Determine whether this hotel is mentioned.
- Determine whether it is actually recommended for this query.
- If the answer lists hotels, identify the relevant competitors actually present in the answer.
- For each competitor, explain the strongest apparent reason they win (location, reviews, family facilities, spa, price/value, beach, brand, parking, etc.). Do not claim causality unless the source supports it; label it as an observed or inferred reason.
- Extract the sources that materially support the answer.
- Identify specific information gaps that could make the hotel less likely to be recommended.
- Produce concrete actions the hotel could take to improve AI visibility.
- Never invent facts, rankings, reviews, prices or amenities.

Return ONLY valid JSON in this exact shape:
{
  "answer":"",
  "hotel_mentioned":false,
  "hotel_recommended":false,
  "hotel_position":null,
  "competitors":[{"name":"","reason":""}],
  "sources":[{"title":"","url":"","domain":""}],
  "gaps":[],
  "actions":[{"title":"","priority":"high|medium|low","reason":""}]
}`;

  const r=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},
    body:JSON.stringify({model,tools:[{type:"web_search"}],input:prompt})
  });
  const d=await r.json();
  if(!r.ok) return res.status(r.status).json({error:d?.error?.message||"OpenAI request failed"});

  const text=d.output_text||(d.output||[])
    .flatMap(x=>x.content||[])
    .map(x=>x.text||"").join("");

  let p;
  try{p=JSON.parse(text)}
  catch{
    const m=text.match(/\{[\s\S]*\}/);
    try{p=m?JSON.parse(m[0]):null}catch{p=null}
  }

  if(!p) return res.status(502).json({error:"AI returned an unreadable result.",raw:text.slice(0,1000)});

  // Responses API exposes web-search citations as URL annotations.
  // Use them as a fallback source list when the model did not populate sources.
  const annotations=(d.output||[])
    .flatMap(x=>x.content||[])
    .flatMap(x=>x.annotations||[])
    .filter(a=>a.type==="url_citation" && (a.url||a.url_citation?.url))
    .map(a=>{
      const c=a.url_citation||a;
      return {title:c.title||c.url, url:c.url, domain:(()=>{try{return new URL(c.url).hostname.replace(/^www\./,"")}catch{return ""}})()};
    });

  const sources=[...(p.sources||[])];
  for(const a of annotations){
    if(a.url && !sources.some(s=>s.url===a.url)) sources.push(a);
  }

  return res.status(200).json({
    ...p,
    sources,
    query,
    checked_at:new Date().toISOString(),
    model,
    status:"observed"
  });
}