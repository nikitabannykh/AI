export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"POST only"});
  const key=process.env.OPENAI_API_KEY;
  if(!key) return res.status(500).json({error:"OPENAI_API_KEY is not configured in Vercel."});
  const {hotel,runs=[]}=req.body||{};
  if(!hotel?.name||!hotel?.city) return res.status(400).json({error:"hotel.name and hotel.city are required"});
  const model=process.env.OPENAI_MODEL||"gpt-6-luna";

  const compactRuns=runs.filter(x=>x.status!=="error").map(x=>({
    platform:x.platform||"chatgpt",
    query:x.query,
    answer:x.answer,
    hotel_mentioned:x.hotel_mentioned,
    hotel_recommended:x.hotel_recommended,
    hotel_position:x.hotel_position,
    competitors:(x.competitors||[]).slice(0,5),
    sources:(x.sources||[]).slice(0,8),
    gaps:(x.gaps||[]).slice(0,8),
    actions:(x.actions||[]).slice(0,5)
  }));

  const prompt=`You are building the canonical AI-ready hotel profile for AIHotel.

Start from the researched hotel profile below and enrich it using the completed AI visibility audit runs. The hotel should NOT have to retype information already available in the audit.

Hotel profile:
${JSON.stringify(hotel)}

Audit evidence:
${JSON.stringify(compactRuns)}

Return ONLY valid JSON:
{
  "name":"",
  "url":"",
  "city":"",
  "country":"",
  "stars":null,
  "type":"",
  "positioning":{
    "summary":"",
    "best_for":[],
    "target_guests":[],
    "differentiators":[]
  },
  "facts":[
    {
      "key":"",
      "label":"",
      "value":"",
      "confidence":"high|medium|low",
      "source_type":"official|public|inferred|missing",
      "source_title":"",
      "source_url":"",
      "evidence":""
    }
  ],
  "ai_gaps":[],
  "competitor_signals":[]
}

Rules:
- Do not invent facts.
- Prefer facts from the official website.
- Public sources may support facts when the official site does not.
- "inferred" means a conclusion suggested by the audit, not a verified hotel fact.
- "missing" means the audit could not verify the fact.
- Keep facts useful for hotel recommendations: location, rooms, breakfast, parking, spa/wellness, pool, restaurant, family facilities, pets, airport transfer, accessibility, business facilities, beach/attractions, unique amenities and other differentiators actually found.
- For every verified fact, include the source URL and a short evidence note when available.
- ai_gaps should focus on information that exists or could matter but is not consistently visible to AI.
- competitor_signals should summarize recurring observed reasons competitors appear to win, without claiming causality.
- Do not output generic filler.`;

  const r=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},
    body:JSON.stringify({model,tools:[{type:"web_search"}],input:prompt})
  });
  const d=await r.json();
  if(!r.ok) return res.status(r.status).json({error:d?.error?.message||"OpenAI request failed"});
  const text=d.output_text||(d.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||"").join("");
  let p;
  try{p=JSON.parse(text)}catch{
    const m=text.match(/\{[\s\S]*\}/);
    try{p=m?JSON.parse(m[0]):null}catch{p=null}
  }
  if(!p?.name||!Array.isArray(p.facts)) return res.status(502).json({error:"AI returned an unreadable profile.",raw:text.slice(0,1200)});
  return res.status(200).json({...p,updated_at:new Date().toISOString(),model});
}