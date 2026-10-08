import vm from 'node:vm';
const send=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
const strip=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export default async function handler(req,res){
 const url=String(req.query?.url||'https://amarande-restmenus.hoteza.app/page/526564');
 try{
  const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 AIHotel debug'}});
  const html=await r.text();
  const m=html.match(/<script>window\\.__NUXT__=([\\s\\S]*?)<\\/script>/i);
  if(!m)return send(res,200,{ok:false,reason:'nuxt script not found',htmlLength:html.length});
  const expression=m[1].replace(/;\\s*$/,'');
  let data;
  try{data=vm.runInNewContext(expression,Object.create(null),{timeout:3000});}
  catch(e){return send(res,200,{ok:false,reason:'eval failed',error:String(e?.message||e),expressionStart:expression.slice(0,300)});}
  const summary={type:typeof data,keys:data&&typeof data==='object'?Object.keys(data).slice(0,200):[],top:Array.isArray(data)?data.length:null};
  const dump=(x,path='',depth=0)=>{
   if(depth>5||x==null)return null;
   if(typeof x!=='object')return String(x).slice(0,250);
   if(Array.isArray(x))return {array:x.length,items:x.slice(0,5).map((v,i)=>dump(v,path+'['+i+']',depth+1))};
   const o={}; for(const k of Object.keys(x).slice(0,80))o[k]=dump(x[k],path+'.'+k,depth+1); return o;
  };
  const find=(x,needle,path='',out=[])=>{
    if(out.length>=20||x==null)return out;
    if(typeof x==='string'){if(x.toLowerCase().includes(needle.toLowerCase()))out.push({path,value:x.slice(0,500)});return out;}
    if(typeof x==='object'){for(const k of Object.keys(x)){find(x[k],needle,path+'.'+k,out);if(out.length>=20)break;}}
    return out;
  };
  return send(res,200,{ok:true,htmlLength:html.length,summary,nuxtDump:dump(data),pizza:find(data,'AMARANDE PIZZA'),room:find(data,'IN -ROOM DINING BREAKFAST'),roomService:find(data,'ROOM SERVICE')});
 }catch(e){return send(res,500,{error:String(e?.message||e)})}
}