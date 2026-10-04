export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"POST only"});
  const key=process.env.OPENAI_API_KEY;
  if(!key) return res.status(500).json({error:"OPENAI_API_KEY is not configured in Vercel."});
  const {url}=req.body||{};
  if(!url) return res.status(400).json({error:"url is required"});
  const model=process.env.OPENAI_MODEL||"gpt-6-luna";
  const prompt=`You are the hotel profile researcher for AIHotel.
Use web search. Open and inspect the official hotel website when possible.
Identify the exact hotel, city, country, hotel type/category, and important positioning facts that should be used to evaluate AI visibility.
Do not invent facts. Prefer the hotel's official website for hotel facts and reputable public sources for location confirmation.
Return ONLY valid JSON:
{"name":"","url":"","city":"","country":"","stars":null,"type":"","positioning":"","key_facts":[]}
Official website: ${url}`;
  const r=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},
    body:JSON.stringify({model,tools:[{type:"web_search"}],input:prompt})
  });
  const d=await r.json();
  if(!r.ok) return res.status(r.status).json({error:d?.error?.message||"OpenAI request failed"});
  const text=d.output_text||(d.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||"").join("");
  let p; try{p=JSON.parse(text)}catch{const m=text.match(/\{[\s\S]*\}/);try{p=m?JSON.parse(m[0]):null}catch{p=null}}
  if(!p?.name||!p?.city) return res.status(502).json({error:"Could not reliably identify the hotel and its location.",raw:text});
  return res.status(200).json({...p,checked_at:new Date().toISOString(),model});
}