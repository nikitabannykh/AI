import vm from 'node:vm';
const send=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
export default async function handler(req,res){
 const url=String(req.query?.url||'https://amarande-restmenus.hoteza.app/page/526564');
 try{
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 AIHotel debug'}});
  const html=await r.text();
  const m=html.match(/<script>window\.\__NUXT__=([\s\S]*?)<\/script>/i);
  if(!m)return send(res,200,{ok:false,reason:'nuxt missing'});
  const data=vm.runInNewContext(m[1].replace(/;\s*$/,''),Object.create(null),{timeout:4000});
  const raw=data?.state?.contentRaw||{};
  const summarize=o=>{
    const x={};
    for(const k of Object.keys(o||{}).slice(0,60)){
      const v=o[k];
      if(v&&typeof v==='object'){
        x[k]={type:v.type||'',title:v.title||v.name||'',price:v.price??'',description:v.description||'',category:v.category||'',menuId:v.menuId||'',parentId:v.parentId||'',image:v.image||'',keys:Object.keys(v).slice(0,30)};
        if(Array.isArray(v.toppings))x[k].toppings=v.toppings.slice(0,10);
      }
    }
    return x;
  };
  const pages=summarize(raw.pages||{});
  const menu=summarize(raw.menu||{});
  const menuItems=Object.entries(raw.menu||{}).filter(([,v])=>v&&typeof v==='object'&&v.type==='menuItem').map(([k,v])=>({key:k,...v})).slice(0,200);
  const pageMenuItems=Object.entries(raw.pages||{}).filter(([,v])=>v&&typeof v==='object'&&v.type==='menuItem').map(([k,v])=>({key:k,...v})).slice(0,200);
  const ordering=Object.entries(raw.menu||{}).filter(([,v])=>v&&typeof v==='object'&&/room|dining|order/i.test(JSON.stringify(v))).slice(0,50).map(([k,v])=>({key:k,type:v.type,title:v.title||v.name,keys:Object.keys(v)}));
  return send(res,200,{ok:true,rawKeys:Object.keys(raw),menuCount:Object.keys(raw.menu||{}).length,pageCount:Object.keys(raw.pages||{}).length,menuItems,pageMenuItems,ordering});
 }catch(e){return send(res,500,{error:String(e?.message||e)})}
}