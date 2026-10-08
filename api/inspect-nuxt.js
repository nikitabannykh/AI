import vm from 'node:vm';
const send=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
export default async function handler(req,res){
  const url=String(req.query?.url||'https://amarande-restmenus.hoteza.app/page/526564');
  try{
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 AIHotel debug'}});
    const html=await r.text();
    const m=html.match(/<script>window\.\__NUXT__=([\s\S]*?)<\/script>/i);
    if(!m)return send(res,200,{ok:false,reason:'nuxt script not found',htmlLength:html.length});
    const expression=m[1].replace(/;\s*$/,'');
    let data;
    try{data=vm.runInNewContext(expression,Object.create(null),{timeout:4000});}
    catch(e){return send(res,200,{ok:false,reason:'eval failed',error:String(e?.message||e),expressionStart:expression.slice(0,250)});}
    const hits=[];
    const walk=(x,path='',depth=0)=>{
      if(hits.length>=40||depth>8||x==null)return;
      if(typeof x==='string'){if(/pizza|burger|hummus|halloumi|squid|room service|in[- ]room dining|fruit platter|menu/i.test(x))hits.push({path,value:x});return;}
      if(Array.isArray(x)){for(let i=0;i<x.length&&i<2000;i++)walk(x[i],path+'['+i+']',depth+1);return;}
      if(typeof x==='object'){for(const k of Object.keys(x).slice(0,300))walk(x[k],path+'.'+k,depth+1);}
    };
    walk(data);
    const arrays=[];
    const scanArrays=(x,path='',depth=0)=>{
      if(arrays.length>=25||depth>6||x==null||typeof x!=='object')return;
      if(Array.isArray(x)){
        const sample=x.slice(0,3);
        const str=JSON.stringify(sample);
        if(/name|price|description|menu|pizza|burger|hummus|halloumi/i.test(str))arrays.push({path,length:x.length,sample});
      }else for(const k of Object.keys(x).slice(0,300))scanArrays(x[k],path+'.'+k,depth+1);
    };
    scanArrays(data);
    return send(res,200,{ok:true,keys:data&&typeof data==='object'?Object.keys(data).slice(0,100):[],hits,arrays});
  }catch(e){return send(res,500,{error:String(e?.message||e)})}
}