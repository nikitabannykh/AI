const send=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(data));};
const readBody=async req=>{let s='';for await(const c of req)s+=c;try{return s?JSON.parse(s):{}}catch{return null}};
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const strip=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();

const toCountry=s=>{
  const v=clean(typeof s==='object'?(s.name||s.code):s).toLowerCase();
  const m={cyprus:'Cyprus',cy:'Cyprus','czechia':'Czechia','czech republic':'Czechia',cz:'Czechia',greece:'Greece',gr:'Greece',spain:'Spain',es:'Spain',italy:'Italy',it:'Italy',germany:'Germany',de:'Germany',austria:'Austria',at:'Austria',france:'France',fr:'France','united kingdom':'United Kingdom',uk:'United Kingdom',portugal:'Portugal',pt:'Portugal',turkey:'Türkiye','türkiye':'Türkiye',tr:'Türkiye',uae:'United Arab Emirates','united arab emirates':'United Arab Emirates',malta:'Malta',croatia:'Croatia',poland:'Poland',russia:'Russia'};
  return m[v]||null;
};

const findLd=html=>{
  const re=/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m;
  while((m=re.exec(html))){
    try{
      const x=JSON.parse(m[1]);const arr=Array.isArray(x)?x:(x&&Array.isArray(x['@graph'])?x['@graph']:[x]);
      for(const y of arr){const a=y&&y.address&&typeof y.address==='object'?y.address:(y&&y.location&&y.location.address);if(!a)continue;const city=clean(a.addressLocality||a.city||a.town),co=toCountry(a.addressCountry||a.country);if(city&&co)return{name:clean(y.name),city,country:co,street:clean(a.streetAddress),postal:clean(a.postalCode),stars:y.starRating?.ratingValue||null,rooms:y.numberOfRooms||null}}
    }catch{}
  }
  return null;
};

const visibleLocation=text=>{
  const t=clean(text),countryPattern='Cyprus|Czechia|Czech Republic|Greece|Spain|Italy|Germany|Austria|France|Portugal|Türkiye|Turkey|United Kingdom|UAE|Malta|Croatia|Poland|Russia';
  const out=[];const add=(city,co,raw)=>{city=clean(city);co=toCountry(co)||clean(co);if(city&&co&&city.length<70&&!out.some(x=>x.city.toLowerCase()===city.toLowerCase()&&x.country.toLowerCase()===co.toLowerCase()))out.push({city,country:co,raw})};
  let m=t.match(new RegExp('(?:in|at|located in|located at)\\s+([^,()|.!?]{2,70})\\s*\\(\\s*('+countryPattern+')\\s*\\)','i'));if(m)add(m[1],m[2],m[0]);
  if(!out.length){m=t.match(new RegExp('([^,()|.!?]{2,70})\\s*\\(\\s*('+countryPattern+')\\s*\\)','i'));if(m)add(m[1],m[2],m[0])}
  if(!out.length){m=t.match(new RegExp('([^,()|.!?]{2,70})\\s*,\\s*('+countryPattern+')\\b','i'));if(m)add(m[1],m[2],m[0])}
  if(!out.length){m=t.match(new RegExp('([^,()|.!?]{2,70})\\s+-\\s*('+countryPattern+')\\b','i'));if(m)add(m[1],m[2],m[0])}
  return out;
};


const absolutize=(href,base)=>{try{return new URL(href,base).href}catch{return null}};
const extractEmails=(html,text)=>{const src=String(html||'')+' '+String(text||'');const out=[...src.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(m=>m[0].toLowerCase());return [...new Set(out)].slice(0,10)};
const extractPhones=(html,text)=>{const src=String(html||'')+' '+String(text||'');const out=[];const add=v=>{const x=clean(v);const digits=x.replace(/\D/g,'');if(digits.length>=8&&digits.length<=16&&!out.includes(x))out.push(x)};for(const m of src.matchAll(/tel:([^"'<>\\s]+)/gi))add(decodeURIComponent(m[1]).replace(/^\+?(\d{3})(\d{2})(\d{3})(\d{2})$/,'+$1 $2 $3 $4'));for(const m of src.matchAll(/(?:Tel(?:ephone)?|Phone|Mobile|Contact)\\s*:?[\\s]+([+\\d][\\d\\s().-]{7,})/gi))add(m[1]);return out.slice(0,10)};
const extractAddresses=(html,text)=>{const src=strip(String(html||'')+' '+String(text||''));const out=[];const patterns=[/(?:Postal Address|Address)\\s*:\\s*([^\\n]{10,180})/i,/([0-9]{1,5}\\s+[A-Z][^,]{2,80}\\s+(?:Avenue|Street|Road|Rd|Street|St|Drive|Lane|Way|Boulevard|Blvd)[^\\n]{0,100})/i];for(const p of patterns){const m=src.match(p);if(m)out.push(clean(m[1]))}return [...new Set(out)].slice(0,5)};
const extractLinks=(html,base)=>{const out=[],re=/<a\\b[^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;let m;while((m=re.exec(html||''))){const href=absolutize(m[1],base),label=strip(m[2]);if(href)out.push({href,label})}return out};
const relevantLinks=(links)=>{const keys=/contact|overview|room|suite|dining|restaurant|bar|menu|spa|fitness|wellness|facilit|service|location|offer|experience|gallery|pool|beach|breakfast|food|drink|meeting|event/i;const seen=new Set(),out=[];for(const x of links){if(!x.href)continue;const u=x.href.split('#')[0];if(seen.has(u)||!keys.test((x.label||'')+' '+u))continue;seen.add(u);out.push(u);if(out.length>=18)break}return out};
const extractBookingUrls=(pages,base)=>[...new Set(pages.flatMap(p=>extractLinks(p.html,p.url||base).filter(x=>/book|reserve|reservation/i.test((x.label||'')+' '+x.href)).map(x=>x.href)))].slice(0,8);
const extractFacts=(pages,finalUrl)=>{const texts=pages.map(p=>strip(p.html||''));return{emails:[...new Set(pages.flatMap(p=>extractEmails(p.html,p.text)))].slice(0,10),phones:[...new Set(pages.flatMap(p=>extractPhones(p.html,p.text)))].slice(0,10),addresses:[...new Set(pages.flatMap(p=>extractAddresses(p.html,p.text)))].slice(0,5),bookingUrls:extractBookingUrls(pages,finalUrl),pagesScanned:pages.map(p=>p.url).slice(0,30)}};

const meta=html=>{
  const out={},re=/<meta\b[^>]*>/gi;let m;
  while((m=re.exec(html))){const tag=m[0],n=(tag.match(/(?:name|property|itemprop)=["']([^"']+)["']/i)||[])[1],c=(tag.match(/content=["']([^"']*)["']/i)||[])[1];if(n&&c)out[n.toLowerCase()]=clean(c)}
  return out;
};

async function fetchPage(url,ms=4500){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),ms);
  try{const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'user-agent':'Mozilla/5.0 AIHotel/1.0','accept':'text/html,application/xhtml+xml'}});if(!r.ok)return null;return{url:r.url,html:await r.text()}}
  catch{return null}finally{clearTimeout(timer)}
}

async function searchBing(q){
  try{const r=await fetch('https://www.bing.com/search?'+new URLSearchParams({q}),{headers:{'user-agent':'Mozilla/5.0 AIHotel/1.0'}});if(!r.ok)return'';return await r.text()}catch{return''}
}
async function searchDdg(q){
  try{const r=await fetch('https://html.duckduckgo.com/html/?'+new URLSearchParams({q,kp:'-2'}),{headers:{'user-agent':'Mozilla/5.0 AIHotel/1.0'}});if(!r.ok)return'';return await r.text()}catch{return''}
}
const searchText=html=>{const a=[];const r1=/<li[^>]*class=["']b_algo["'][^>]*>([\s\S]*?)<\/li>/gi;let m;while((m=r1.exec(html))&&a.length<8)a.push(strip(m[1]));const r2=/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;while((m=r2.exec(html))&&a.length<8)a.push(strip(m[1]));return a.join(' ')};

export default async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'POST only'});
  try{
    const b=await readBody(req);if(!b||!b.url)return send(res,400,{error:'url required'});
    let url=String(b.url).trim();if(!/^https?:\/\//i.test(url))url='https://'+url;
    const first=await fetchPage(url);
    if(!first)return send(res,502,{error:'Не удалось открыть официальный сайт. Проверьте URL.'});
    const html=first.html||'',finalUrl=first.url||url,md=meta(html),ld=findLd(html),vl=visibleLocation(html),title=strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'')||new URL(finalUrl).hostname,host=new URL(finalUrl).hostname.replace(/^www\./i,'');
    const hotel={name:ld?.name||md['og:site_name']||title.split('|')[0].split(' - ')[0].trim(),url:finalUrl,host,city:ld?.city||md.addresslocality||md['og:locality']||vl[0]?.city||null,country:ld?.country||toCountry(md.addresscountry||md['og:country-name'])||vl[0]?.country||null,stars:ld?.stars||null,rooms:ld?.rooms||null,address:ld?.street||''};
    const seedPaths=['/hotel-overview/','/contact/','/contact-us/','/location/','/about-us/','/rooms-suites/','/rooms/','/dining/','/spa-fitness/','/offers/','/gallery/'];
    const seedUrls=[finalUrl,...seedPaths.map(p=>new URL(p,finalUrl).href)];
    const directPages=await Promise.all(seedUrls.map(u=>fetchPage(u,3500)));
    const linkedUrls=relevantLinks(extractLinks(html,finalUrl));
    const linkedPages=await Promise.all(linkedUrls.map(u=>fetchPage(u,2800)));
    const pages=[...directPages,...linkedPages].filter(Boolean);
    for(const p of pages){const j=findLd(p.html||''),v=visibleLocation(p.html||'');if(!hotel.name&&j?.name)hotel.name=j.name;if(!hotel.city&&j?.city)hotel.city=j.city;if(!hotel.country&&j?.country)hotel.country=j.country;if(!hotel.address&&j?.street)hotel.address=j.street;if(!hotel.city&&v[0]?.city)hotel.city=v[0].city;if(!hotel.country&&v[0]?.country)hotel.country=v[0].country;}
    const facts=extractFacts(pages,finalUrl);
    if(!hotel.address&&facts.addresses[0])hotel.address=facts.addresses[0];
    if(!hotel.city||!hotel.country){
      const q='"'+hotel.name+'" "'+host+'" location';const ss=await Promise.all([searchBing(q),searchDdg(q)]);const joined=ss.map(searchText).join(' ');const v=visibleLocation(joined);if(!hotel.city&&v[0]?.city)hotel.city=v[0]?.city;if(!hotel.country&&v[0]?.country)hotel.country=v[0]?.country;
    }
    if(!hotel.city||!hotel.country)return send(res,422,{error:'Не удалось определить город и страну автоматически.',hotel,debug:{title,htmlLength:html.length,homepageLocations:vl.slice(0,8),emails:facts.emails,phones:facts.phones,addresses:facts.addresses,pagesScanned:facts.pagesScanned}});
    const content={basics:{address:hotel.address||facts.addresses[0]||'',phone:facts.phones[0]||'',email:facts.emails[0]||'',website:finalUrl,bookingUrl:facts.bookingUrls[0]||'',additionalEmails:facts.emails,additionalPhones:facts.phones},sources:{pagesScanned:facts.pagesScanned}};
    return send(res,200,{hotel,content,crawl:{title,pagesScanned:facts.pagesScanned.length,checkedPages:'homepage + contact + hotel/content pages + relevant linked pages + search fallback'},detectedLocations:vl.slice(0,8)});
  }catch(e){return send(res,500,{error:'Ошибка обработки сайта: '+(e?.message||String(e))})}
}