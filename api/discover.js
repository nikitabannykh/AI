const send=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(data));};
const readBody=async req=>{let s='';for await(const c of req)s+=c;try{return s?JSON.parse(s):{}}catch{return null}};
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const strip=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();
const aliases={cyprus:'Cyprus',cy:'Cyprus','czechia':'Czechia','czech republic':'Czechia',cz:'Czechia',greece:'Greece',gr:'Greece',spain:'Spain',es:'Spain',italy:'Italy',it:'Italy',germany:'Germany',de:'Germany',austria:'Austria',at:'Austria',france:'France',fr:'France','united kingdom':'United Kingdom',uk:'United Kingdom',portugal:'Portugal',pt:'Portugal',turkey:'Türkiye','türkiye':'Türkiye',tr:'Türkiye',uae:'United Arab Emirates','united arab emirates':'United Arab Emirates',malta:'Malta',croatia:'Croatia',poland:'Poland',russia:'Russia'};
const toCountry=s=>{const v=clean(typeof s==='object'?(s.name||s.code):s);return v?(aliases[v.toLowerCase()]||null):null};
const ldItems=html=>{const out=[];const re=/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m;while((m=re.exec(html))){try{const x=JSON.parse(m[1]);if(Array.isArray(x))out.push(...x);else if(x&&Array.isArray(x['@graph']))out.push(...x['@graph']);else if(x)out.push(x)}catch{}}return out};
const fromLd=html=>{for(const x of ldItems(html)){const a=x&&x.address&&typeof x.address==='object'?x.address:(x&&x.location&&x.location.address);if(!a)continue;const city=clean(a.addressLocality||a.city||a.town);const co=toCountry(a.addressCountry||a.country);if(city&&co)return{name:clean(x.name),city,country:co,street:clean(a.streetAddress),postal:clean(a.postalCode),stars:x.starRating&&x.starRating.ratingValue||null,rooms:x.numberOfRooms||null}}return null};
const visibleLocation=html=>{
  const text=strip(html),out=[],add=(city,co,raw)=>{city=clean(city);co=toCountry(co)||clean(co);if(city&&co&&city.length<=80&&!out.some(x=>x.city.toLowerCase()===city.toLowerCase()&&x.country.toLowerCase()===co.toLowerCase()))out.push({city,country:co,raw})};
  let m=text.match(/(?:in|at|located in|located at)\s+([^()|,]{2,70})\s*\(\s*(Cyprus|Czechia|Czech Republic|Greece|Spain|Italy|Germany|Austria|France|Portugal|Türkiye|Turkey|United Kingdom|UAE|Malta|Croatia|Poland|Russia)\s*\)/i);if(m)add(m[1],m[2],m[0]);
  m=text.match(/([^|,()]{2,70})\s*,\s*(Cyprus|Czechia|Czech Republic|Greece|Spain|Italy|Germany|Austria|France|Portugal|Türkiye|Turkey|United Kingdom|UAE|Malta|Croatia|Poland|Russia)\b/i);if(m)add(m[1],m[2],m[0]);
  m=text.match(/([^|()]{2,70})\s*\(\s*(Cyprus|Czechia|Czech Republic|Greece|Spain|Italy|Germany|Austria|France|Portugal|Türkiye|Turkey|United Kingdom|UAE|Malta|Croatia|Poland|Russia)\s*\)/i);if(m)add(m[1].replace(/^.*[.!?]\s*/,'').replace(/^(?:a|an|the)\s+/i,''),m[2],m[0]);
  return out;
};
async function openSite(url,ms=5000){const c=new AbortController(),timer=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'user-agent':'Mozilla/5.0 AIHotel/1.0','accept':'text/html,application/xhtml+xml'}});if(!r.ok)return{error:'Официальный сайт вернул HTTP '+r.status};return{url:r.url,html:await r.text()}}catch(e){return{error:'Не удалось открыть официальный сайт: '+(e&&e.message||String(e))}}finally{clearTimeout(timer)}}
async function ddg(q,ms=3000){const c=new AbortController(),timer=setTimeout(()=>c.abort(),ms);try{const u='https://html.duckduckgo.com/html/?'+new URLSearchParams({q,kp:'-2'});const r=await fetch(u,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 AIHotel/1.0'}});if(!r.ok)return'';return await r.text()}catch{return''}finally{clearTimeout(timer)}}
const searchText=html=>{const a=[];const re=/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(html))&&a.length<8){const seg=html.slice(m.index,m.index+2200);const sn=(seg.match(/result__snippet[^>]*>([\s\S]*?)<\/div>/i)||[])[1]||'';a.push(strip(m[1])+' '+strip(sn))}return a.join(' ')};
export default async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'POST only'});
  try{
    const b=await readBody(req);
    if(!b||!b.url)return send(res,400,{error:'url required'});
    let url=String(b.url).trim();if(!/^https?:\/\//i.test(url))url='https://'+url;
    const p=await openSite(url);if(p.error)return send(res,502,{error:p.error});
    const finalUrl=p.url||url,html=p.html||'',md=(()=>{const o={};const re=/<meta\b[^>]*>/gi;let m;while((m=re.exec(html))){const n=(m[0].match(/(?:name|property)=["']([^"']+)["']/i)||[])[1],c=(m[0].match(/content=["']([^"']*)["']/i)||[])[1];if(n&&c)o[n.toLowerCase()]=clean(c)}return o})();
    const title=strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'')||new URL(finalUrl).hostname;
    const ld=fromLd(html),vl=visibleLocation(html),host=new URL(finalUrl).hostname.replace(/^www\./i,'');
    const hotel={name:(ld&&ld.name)||md['og:site_name']||title.split('|')[0].split(' - ')[0].trim(),url:finalUrl,host,city:(ld&&ld.city)||md.addresslocality||md['og:locality']||(vl[0]&&vl[0].city)||null,country:(ld&&ld.country)||toCountry(md.addresscountry||md['og:country-name'])||(vl[0]&&vl[0].country)||null,stars:(ld&&ld.stars)||null,rooms:(ld&&ld.rooms)||null,address:(ld&&ld.street)||''};
    if(!hotel.city||!hotel.country){
      const st=await ddg('"'+hotel.name+'" '+host+' address city country');
      const sv=visibleLocation(searchText(st));
      if(!hotel.city&&sv[0]?.city)hotel.city=sv[0].city;
      if(!hotel.country&&sv[0]?.country)hotel.country=sv[0].country;
    }
    if(!hotel.city||!hotel.country)return send(res,422,{error:'Не удалось определить город и страну автоматически.',hotel,debug:{title,htmlLength:html.length,detected:vl.slice(0,8)}});
    return send(res,200,{hotel,crawl:{title,textSample:strip(html).slice(0,1800),checkedPages:1},detectedLocations:vl.slice(0,8)});
  }catch(e){return send(res,500,{error:'Ошибка обработки сайта: '+(e&&e.message||String(e))})}
}