const j=(res,s,b)=>{res.statusCode=s;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(b))};
const read=async req=>{let x='';for await(const c of req)x+=c;return x?JSON.parse(x):{}};
const strip=x=>String(x||'').replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim();
const clean=x=>String(x??'').replace(/\\s+/g,' ').trim()||null;

function countryName(x){
  const v=clean(typeof x==='object'?(x.name||x.code):x);if(!v)return null;
  const m={CZ:'Czechia',CS:'Czechia',CY:'Cyprus',GR:'Greece',ES:'Spain',IT:'Italy',FR:'France',DE:'Germany',AT:'Austria',PT:'Portugal',TR:'Türkiye',GB:'United Kingdom',UK:'United Kingdom',US:'United States',AE:'United Arab Emirates',HR:'Croatia',MT:'Malta',PL:'Poland',SK:'Slovakia'};
  return m[v.toUpperCase()]||v;
}
function flatten(v,out=[]){
  if(!v)return out;
  if(Array.isArray(v)){for(const z of v)flatten(z,out);return out}
  if(typeof v==='object'){if(v['@graph'])flatten(v['@graph'],out);out.push(v)}
  return out;
}
function types(x){
  const t=x?.['@type'];return (Array.isArray(t)?t:[t]).filter(Boolean).map(String).join(' ').toLowerCase();
}
function addresses(x){
  const out=[];const add=v=>{if(v&&typeof v==='object')out.push(v)};
  add(x?.address);add(x?.location?.address);add(x?.contactPoint?.address);
  if(Array.isArray(x?.location))x.location.forEach(z=>add(z?.address));
  return out;
}
function parseJsonLd(html){
  const out=[];
  for(const m of html.matchAll(/<script[^>]*type=["']application\\/ld\\+json["'][^>]*>([\\s\\S]*?)<\\/script>/gi)){
    try{out.push(...flatten(JSON.parse(m[1])))}catch{}
  }
  return out;
}
function extract(html){
  const ld=parseJsonLd(html);let best=null;
  for(const x of ld){
    const t=types(x);
    const a=addresses(x)[0];
    if(!a)continue;
    const cand={
      name:clean(x.name),
      city:clean(a.addressLocality||a.city||a.town),
      country:countryName(a.addressCountry||a.country),
      street:clean(a.streetAddress),
      postal:clean(a.postalCode),
      stars:x.starRating?.ratingValue||x.starRating||null,
      rooms:x.numberOfRooms||null
    };
    if(cand.city&&cand.country&&(t.includes('hotel')||t.includes('resort')||t.includes('lodging')||cand.name))return cand;
    if(!best&&(cand.city||cand.country||cand.street))best=cand;
  }

  const text=strip(html);
  const meta={};
  for(const m of html.matchAll(/<meta\\b[^>]*>/gi)){
    const tag=m[0],n=(tag.match(/(?:name|property|itemprop)=["']([^"']+)["']/i)||[])[1],c=(tag.match(/content=["']([^"']*)["']/i)||[])[1];
    if(n&&c)meta[n.toLowerCase()]=clean(c);
  }
  const city=meta.addresslocality||meta['og:locality']||meta['hotel:contact_data:locality']||meta['geo.placename'];
  const country=countryName(meta.addresscountry||meta['og:country-name']||meta['hotel:contact_data:country_name']||meta.country||meta['geo.country']);
  const street=meta['street-address']||meta.address||null,postal=meta['postal-code']||null;
  const metaCand={name:meta['og:site_name'],city:city||null,country:country||null,street,postal,stars:null,rooms:null};
  if(metaCand.city||metaCand.country||metaCand.street)best=best||metaCand;

  const addrText=text.match(/(?:address|adresse|dirección|indirizzo|адрес)[^\\n]{0,120}/i)?.[0]||'';
  if(!best?.street&&addrText)best={...(best||{}),street:addrText.replace(/^(?:address|adresse|dirección|indirizzo|адрес)[:\\s-]*/i,'').trim()};

  return best||{};
}
async function fetchPage(url,ms=4500){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{
    const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'user-agent':'AIHotel/1.0','accept':'text/html,application/xhtml+xml'}});
    if(!r.ok)return null;
    return {url:r.url,html:await r.text()};
  }catch{return null}finally{clearTimeout(t)}
}
function sameHost(base,href){try{return new URL(href,base).hostname.replace(/^www\\./,'')===new URL(base).hostname.replace(/^www\\./,'')}catch{return false}}
function useful(href,text){return /(contact|location|where|directions|about|hotel|property|find-us|findus|impressum|contacto|ubicacion|adresse|standort)/i.test((href+' '+text).toLowerCase())}
async function geocode(q){
  if(!q)return null;
  const c=new AbortController(),t=setTimeout(()=>c.abort(),3500);
  try{
    const u='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q='+encodeURIComponent(q);
    const r=await fetch(u,{signal:c.signal,headers:{'user-agent':'AIHotel/1.0'}});
    if(!r.ok)return null;
    const a=(await r.json())[0]?.address||{};
    return {city:clean(a.city||a.town||a.village||a.municipality),country:countryName(a.country_code||a.country)};
  }catch{return null}finally{clearTimeout(t)}
}
export default async function handler(req,res){
  try{
    if(req.method!=='POST')return j(res,405,{error:'POST only'});
    const b=await read(req);if(!b.url)return j(res,400,{error:'url required'});
    let first=await fetchPage(b.url);
    if(!first)return j(res,502,{error:'Не удалось открыть официальный сайт. Проверьте URL и доступность сайта.'});
    const base=extract(first.html);let found={...base};let checked=1;let combined=first.html;

    if(!found.city||!found.country){
      const candidates=[];
      for(const m of first.html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi)){
        const href=m[1],txt=strip(m[2]);
        if(sameHost(first.url,href)&&useful(href,txt)){
          try{const u=new URL(href,first.url).href;if(!candidates.includes(u))candidates.push(u)}catch{}
        }
      }
      for(const p of ['/contact','/contact-us','/location','/about-us']){
        try{const u=new URL(p,first.url).href;if(!candidates.includes(u))candidates.push(u)}catch{}
      }
      const pages=await Promise.all(candidates.slice(0,3).map(u=>fetchPage(u)));
      for(const p of pages){if(!p)continue;checked++;combined+='\\n'+p.html;const x=extract(p.html);for(const [k,v] of Object.entries(x))if(v&&!found[k])found[k]=v;if(found.city&&found.country)break}
    }

    if(!found.city||!found.country){
      const q=[found.name,found.street,found.postal,found.city,found.country].filter(Boolean).join(', ');
      const g=await geocode(q);if(g){found.city=found.city||g.city;found.country=found.country||g.country}
    }

    const ld=parseJsonLd(combined);
    const h=ld.find(x=>/hotel|resort|lodging/i.test(types(x)))||ld.find(x=>x?.name)||{};
    const a=addresses(h)[0]||{};
    const title=(combined.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i)||[])[1]||new URL(first.url).hostname;
    const host=new URL(first.url).hostname.replace(/^www\\./,'');
    const name=found.name||clean(h.name)||strip(title).split('|')[0].split(' - ')[0].trim();
    const city=clean(found.city||a.addressLocality);
    const country=countryName(found.country||a.addressCountry);
    if(!city||!country)return j(res,422,{error:'Не удалось определить город и страну автоматически. На сайте не найден достаточно однозначный адрес.',hotel:{name,url:first.url,host,city,country,street:found.street||a.streetAddress||null,postal:found.postal||a.postalCode||null},debug:{checkedPages:checked}});
    return j(res,200,{hotel:{name,url:first.url,host,city,country,stars:found.stars||h.starRating?.ratingValue||h.starRating||null,rooms:found.rooms||h.numberOfRooms||null,address:[found.street||a.streetAddress,found.postal||a.postalCode,city].filter(Boolean).join(', ')},crawl:{title:strip(title),textSample:strip(combined).slice(0,1800),checkedPages:checked}});
  }catch(e){return j(res,500,{error:'Ошибка обработки сайта: '+(e?.message||String(e))})}
}