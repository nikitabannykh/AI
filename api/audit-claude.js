export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"POST only"});
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key) return res.status(500).json({error:"ANTHROPIC_API_KEY is not configured in Vercel."});
  const {hotel,query}=req.body||{};
  if(!hotel?.name||!hotel?.city||!query) return res.status(400).json({error:"hotel.name, hotel.city and query are required"});

  const model=process.env.CLAUDE_MODEL||"claude-sonnet-5-5";
  const prompt=`You are the AIHotel visibility analyst.

Simulate and analyze what a traveler-facing AI assistant would recommend for this hotel search.

Hotel:
${JSON.stringify(hotel)}

Traveler query:
"${query}"

Rules:
- Interpret generic queries in the hotel's city/country.
- Use web search and current public information before answering.
- Identify the exact hotel and do not confuse it with similarly named properties.
- Determine whether this hotel is mentioned and actually recommended.
- If the answer lists hotels, identify the competitors actually present.
- For each competitor, explain the strongest OBSERVED or INFERRED reason they win. Do not claim causality unless directly supported.
- Extract sources that materially support the answer.
- Identify information gaps that may make this hotel less likely to be recommended.
- Produce concrete actions to improve AI visibility.
- Never invent facts, rankings, reviews, prices or amenities.
- Return ONLY valid JSON and no markdown.

JSON shape:
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

  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${key}`,
      "anthropic-version":"2023-06-01"
    },
    body:JSON.stringify({
      model,
      max_tokens:3000,
      tools:[{type:"web_search_20250305",name:"web_search",max_uses:3}],
      messages:[{role:"user",content:prompt}]
    })
  });

  const d=await r.json();
  if(!r.ok) return res.status(r.status).json({error:d?.error?.message||"Claude request failed"});

  const blocks=d.content||[];
  const text=blocks.filter(x=>x.type==="text").map(x=>x.text||"").join("\n");
  let p;
  try{p=JSON.parse(text)}
  catch{
    const m=text.match(/\{[\s\S]*\}/);
    try{p=m?JSON.parse(m[0]):null}catch{p=null}
  }
  if(!p) return res.status(502).json({error:"Claude returned an unreadable result.",raw:text.slice(0,1200)});

  const sources=[...(p.sources||[])];
  for(const block of blocks){
    if(block.type==="text"){
      for(const c of (block.citations||[])){
        if(c.url && !sources.some(s=>s.url===c.url)){
          sources.push({title:c.title||c.url,url:c.url,domain:(()=>{try{return new URL(c.url).hostname.replace(/^www\./,"")}catch{return ""}})()});
        }
      }
    }
  }

  return res.status(200).json({
    ...p,
    sources,
    query,
    checked_at:new Date().toISOString(),
    model,
    platform:"claude",
    status:"observed",
    usage:d.usage||null
  });
}