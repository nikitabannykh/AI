const send=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
export default async function handler(req,res){
  const url=String(req.query?.url||'https://amarande-restmenus.hoteza.app/page/526564');
  const needle=String(req.query?.needle||'AMARANDE PIZZA');
  try{
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 AIHotel debug','accept':'text/html,application/xhtml+xml'}});
    const html=await r.text();
    const idx=html.toLowerCase().indexOf(needle.toLowerCase());
    return send(res,200,{status:r.status,finalUrl:r.url,htmlLength:html.length,needle,index:idx,context:idx>=0?html.slice(Math.max(0,idx-10000),idx+20000):'',prefix:html.slice(2600000,2650000)});
  }catch(e){return send(res,500,{error:String(e?.message||e)})}
}