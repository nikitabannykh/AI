const send=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(data));};
const readBody=async req=>{let s='';for await(const c of req)s+=c;try{return s?JSON.parse(s):{}}catch{return null}};
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const strip=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();
const countryMap={CY:'Cyprus',CZ:'Czechia','CZECH REPUBLIC':'Czechia',GR:'Greece',ES:'Spain',IT:'Italy',DE:'Germany',AT:'Austria',FR:'France',GB:'United Kingdom',UK:'United Kingdom',PT:'Portugal',TR:'Türkiye',TURKEY:'Türkiye',AE:'United Arab Emirates',UAE:'United Arab Emirates',HR:'Croatia',MT:'Malta',PL:'Poland',SK:'Slovakia',US:'United States',CA:'Canada',RU:'Russia'};
const toCountry=s=>{const v=clean(typeof s==='object'?(s.name||s.code):s);return v?(countryMap[v.toUpperCase()]||v):null};
const countries=Object.keys(countryMap).filter(k=>k.length>2).map(k=>countryMap[k]).join('|');
const ldItems=html=>{const out=[];const re=/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m;while((m=re.exec(html))){try{const x=JSON.parse(m[1]);if(Array.isArray(x))out.push(...x);else if(x&&Array.isArray(x['@graph']))out.push(...x['@graph']);else if(x)out.push(x)}catch{}}return out};
const findHotel=html=>{for(const x of ldItems(html)){const a=x&&x.address&&typeof x.address==='object'?x.address:(x&&x.location&&x.location.address);if(!a)continue;const city=clean(a.addressLocality||a.city||a.town);const co=toCountry(a.addressCountry||a.country);if(city&&co)return{name:clean(x.name),city,country:co,street:clean(a.streetAddress),postal:clean(a.postalCode),stars:x.starRating&&x.starRating.ratingValue||null,rooms:x.numberOfRooms||null}}return null};
const meta=html=>{const o={};const re=/<meta\b[^>]*>/gi;let m;while((m=re.exec(html))){const t=m[0],n=(t.match(/(?:name|property|itemprop)=["']([^"']+)["']/i)||[])[1],c=(t.match(/content=["']([^"']*)["']/i)||[])[1];if(n&&c)o[n.toLowerCase()]=clean(c)}return o};
const visibleLocation=html=>{
  const text=strip(html);
  const out=[];
  const add=(city,co,raw)=>{city=clean(city);co=toCountry(co);if(city&&co&&city.length<=80&&!out.some(x=>x.city.toLowerCase()===city.toLowerCase()&&x.country===co))out.push({city,country:co,raw})};
  let m;
  const p1=new RegExp("\\b(?:in|at|from|located in|located at)\\s+([A-Za-zÀ-ÿА-Яа-яА-ЯёЁ0-9][A-Za-zÀ-ÿА-Яа-яА-ЯёЁ0-9 .'-]{1,70}?)\\s*\\(\\s*(Cyprus|Czechia|Czech Republic|Greece|Spain|Italy|Germany|Austria|France|Portugal|Türkiye|Turkey|United Kingdom|UAE|Malta|Croatia|Poland|Russia)\\s*\\)","ig");
  while((m=p1.exec(text))&&out.length<12)add(m[1],m[2],m[0]);
  const p2=new RegExp("\\b([A-Za-zÀ-ÿА-Яа-яА-ЯёЁ0-9][A-Za-zÀ-ÿА-Яа-яА-ЯёЁ0-9 .'-]{1,70}?)\\s*\\(\\s*(Cyprus|Czechia|Czech Republic|Greece|Spain|Italy|Germany|Austria|France|Portugal|Türkiye|Turkey|United Kingdom|UAE|Malta|Croatia|Poland|Russia)\\s*\\)","ig");
  while((m=p2.exec(text))&&out.length<20)add(m[1],m[2],m[0]);
  const p3=new RegExp("\\b([A-Za-zÀ-ÿА-Яа-яА-ЯёЁ0-9][A-Za-zÀ-ÿА-Яа-яА-ЯёЁ0-9 .'-]{1,70}?)\\s*,\\s*(Cyprus|Czechia|Czech Republic|Greece|Spain|Italy|Germany|Austria|France|Portugal|Türkiye|Turkey|United Kingdom|UAE|Malta|Croatia|Poland|Russia)\\b","ig");
  while((m=p3.exec(text))&&out.length<25)add(m[1],m[2],m[0]);
  return out;
};
async function openSite(url,ms=7000){const c=new AbortController(),timer=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'user-agent':'Mozilla/5.0 AIHotel/1.0','accept':'text/html,application/xhtml+xml'}});if(!r.ok)return{error:'Официальный сайт вернул HTTP '+r.status};return{url:r.url,html:await r.text()}}catch(e){return{error:'Не удалось открыть официальный сайт: '+(e&&e.message||String(e))}}finally{clearTimeout(timer)}}
const sameHost=(base,href)=>{try{return new URL(href,base).hostname.replace(/^www\./,'')===new URL(base).hostname.replace(/^www\./,'')}catch{return false}};
async function geocode(q,ms=4000){if(!q)return null;const c=new AbortController(),timer=setTimeout(()=>c.abort(),ms);try{const u='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q='+encodeURIComponent(q);const r=await fetch(u,{signal:c.signal,headers:{'user-agent':'AIHotel/1.0'}});if(!r.ok)return null;const x=(await r.json())[0];if(!x)return null;return{city:clean(x.address?.city||x.address?.town||x.address?.village||x.address?.municipality),country:toCountry(x.address?.country_code||x.address?.country),display:clean(x.display_name)}}catch{return null}finally{clearTimeout(timer)}}
async function ddg(q){try{const u='https://html.duckduckgo.com/html/?'+new URLSearchParams({q,kp:'-2'});const r=await fetch(u,{headers:{'user-agent':'Mozilla/5.0 AIHotel/1.0'}});if(!r.ok)return'';return await r.text()}catch{return''}}
const searchSnippets=html=>{const out=[];const re=/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(html))&&out.length<8){const seg=html.slice(m.index,m.index+2600);out.push(strip(m[1])+' '+strip((seg.match(/result__snippet[^>]*>([\s\S]*?)<\/(?:a|div)>/i)||[])[1]||''))}return out.join(' ')};
export default async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'POST only'});
  try{
    const b=await readBody(req);if(!b||!b.url)return send(res,400,{error:'url required'});
    let url=String(b.url).trim();if(!/^https?:\/\//i.test(url))url='https://'+url;
    const first=await openSite(url);if(first.error)return send(res,502,{error:first.error});
    const finalUrl=first.url||url,html=first.html||'',md=meta(html),ld=findHotel(html),locs=visibleLocation(html);
    const titleMatch=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i),title=strip(titleMatch?titleMatch[1]:'')||new URL(finalUrl).hostname;
    const host=new URL(finalUrl).hostname.replace(/^www\./i,'');
    const hotel={name:(ld&&ld.name)||md['og:site_name']||title.split('|')[0].split(' - ')[0].trim(),url:finalUrl,host,city:(ld&&ld.city)||md.addresslocality||md['og:locality']||(locs[0]&&locs[0].city)||null,country:(ld&&ld.country)||toCountry(md.addresscountry||md['og:country-name'])||(locs[0]&&locs[0].country)||null,stars:(ld&&ld.stars)||null,rooms:(ld&&ld.rooms)||null,address:(ld&&ld.street)||''};
    if(!hotel.city||!hotel.country){
      const linkList=[];const re=/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
      while((m=re.exec(html))&&linkList.length<10){const href=m[1],txt=strip(m[2]);if(sameHost(finalUrl,href)&&/(contact|location|where|address|find-us|about)/i.test(href+' '+txt)){try{const u=new URL(href,finalUrl).href;if(!linkList.includes(u))linkList.push(u)}catch{}}}
      for(const p of ['/contact','/contact-us','/location','/about-us','/find-us']){try{const u=new URL(p,finalUrl).href;if(!linkList.includes(u))linkList.push(u)}catch{}}
      const pages=await Promise.all(linkList.slice(0,3).map(u=>openSite(u,3500)));
      for(const p of pages){if(!p||p.error)continue;const h=p.html||'',l=visibleLocation(h),j=findHotel(h);if(!hotel.city&&j?.city)hotel.city=j.city;if(!hotel.country&&j?.country)hotel.country=j.country;if(!hotel.city&&l[0]?.city)hotel.city=l[0].city;if(!hotel.country&&l[0]?.country)hotel.country=l[0].country;if(!hotel.address&&l[0]?.raw)hotel.address=l[0].raw;if(hotel.city&&hotel.country)break}
    }
    if(!hotel.city||!hotel.country){
      const g=await geocode([hotel.name,hotel.address,hotel.country].filter(Boolean).join(', '),4500);
      if(g){hotel.city=hotel.city||g.city;hotel.country=hotel.country||g.country}
    }
    if(!hotel.city||!hotel.country){
      const ss=await ddg('"'+hotel.name+'" '+host+' address location');
      const st=searchSnippets(ss);
      const g=await geocode([hotel.name,st.slice(0,500)].filter(Boolean).join(', '),4500);
      if(g){hotel.city=hotel.city||g.city;hotel.country=hotel.country||g.country}
    }
    if(!hotel.city||!hotel.country)return send(res,422,{error:'Не удалось определить город и страну автоматически.',hotel,debug:{title,htmlLength:html.length,detectedLocations:locs.slice(0,8)}});
    return send(res,200,{hotel,crawl:{title,textSample:strip(html).slice(0,1800),checkedPages:'homepage + contact/location fallback'},detectedLocations:locs.slice(0,8)});
  }catch(e){return send(res,500,{error:'Ошибка обработки сайта: '+(e&&e.message||String(e))})}
}