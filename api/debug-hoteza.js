const send=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
const strip=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export default async function handler(req,res){
  const url=String(req.query?.url||'https://amarande-restmenus.hoteza.app/page/526564');
  try{
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 AIHotel debug','accept':'text/html,application/xhtml+xml'}});
    const html=await r.text();
    const needles=['POOL FOOD MENU','A LA CARTE MENU','AZURE 47','ROOM SERVICE','menu','items','products','pageId','__NUXT__','api'];
    const out={status:r.status,finalUrl:r.url,htmlLength:html.length,textLength:strip(html).length,needles:{}};
    for(const q of needles){
      const qlc=q.toLowerCase(),hl=html.toLowerCase(),idx=hl.indexOf(qlc);
      out.needles[q]={index:idx,context:idx>=0?html.slice(Math.max(0,idx-1000),idx+5000):''};
    }
    const urls=[...html.matchAll(/https?:\/\/[^"'<>\s]+/gi)].map(m=>m[0]).filter(u=>/hoteza|file|menu|api|static/i.test(u)).slice(0,200);
    out.urls=[...new Set(urls)];
    const scripts=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]).slice(0,50);
    out.scripts=scripts;
    return send(res,200,out);
  }catch(e){return send(res,500,{error:String(e?.message||e)})}
}