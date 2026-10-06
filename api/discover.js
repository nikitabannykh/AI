const send=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(data))};
const readBody=async req=>{let s='';for await(const c of req)s+=c;return s?safeJson(s):{}};
const safeJson=s=>{try{return JSON.parse(s)}catch{return null}};
const clean=s=>String(s==null?'':s).replace(/\\s+/g,' ').trim();
const strip=s=>String(s||'').replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\\s+/g,' ').trim();
const country=s=>{const v=clean(typeof s==='object'?(s.name||s.code):s);const m={CY:'Cyprus',CZ:'Czechia',GR:'Greece',ES:'Spain',IT:'Italy',DE:'Germany',AT:'Austria',FR:'France',GB:'United Kingdom',UK:'United Kingdom',PT:'Portugal',TR:'Türkiye',AE:'United Arab Emirates',HR:'Croatia',MT:'Malta',PL:'Poland',SK:'Slovakia',US:'United States',CA:'Canada',RU:'Russia'};return v?(m[v.toUpperCase()]||v):null};
const jsonLd=html=>{const out=[];const re=/<script[^>]*type=["']application\\/ld\\+json["'][^>]*>([\\s\\S]*?)<\\/script>/gi;let m;while((m=re.exec(html))){try{const x=JSON.parse(m[1]);if(Array.isArray(x))out.push(...x);else if(x&&x['@graph']&&Array.isArray(x['@graph']))out.push(...x['@graph']);else if(x)out.push(x)}catch{}}return out};
const addressOf=x=>{if(!x||typeof x!=='object')return null;const a=x.address||x.location?.address;if(a&&typeof a==='object')return a;return null};
const candidateFromLd=html=>{const items=jsonLd(html);for(const x of items){const a=addressOf(x);if(!a)continue;const t=Array.isArray(x['@type'])?x['@type'].join(' '):String(x['@type']||'');const city=clean(a.addressLocality||a.city);const co=country(a.addressCountry||a.country);if(city&&co&&(x.name||/hotel|resort|lodging/i.test(t)))return{name:clean(x.name),city,country:co,street:clean(a.streetAddress),postal:clean(a.postalCode),stars:x.starRating&&x.starRating.ratingValue||null,rooms:x.numberOfRooms||null}}return null};
const meta=html=>{const out={};const re=/<meta\\b[^>]*>/gi;let m;while((m=re.exec(html))){const tag=m[0];const n=(tag.match(/(?:name|property|itemprop)=["']([^"']+)["']/i)||[])[1];const c=(tag.match(/content=["']([^"']*)["']/i)||[])[1];if(n&&c)out[n.toLowerCase()]=clean(c)}return out};
const fromText=(html,title)=>{const text=strip(html);let city=null,co=null;const patterns=[/\\b(?:address|adresse|адрес|dirección|indirizzo)\\s*[:,-]\\s*([^|]{3,120})/i,/\\b(?:location|местоположение)\\s*[:,-]\\s*([^|]{3,120})/i];let address='';for(const p of patterns){const m=text.match(p);if(m){address=m[1];break}}const cityMatch=address.match(/,\\s*([A-ZА-Я][^,]{2,50})\\s*,/);if(cityMatch)city=clean(cityMatch[1]);const coMatch=text.match(/\\b(Cyprus|Czechia|Czech Republic|Greece|Spain|Italy|Germany|Austria|France|Portugal|Türkiye|Turkey|United Kingdom|UAE|Malta|Croatia|Poland)\\b/i);if(coMatch)co=country(coMatch[1]);return{city,country:co,street:address||null,name:null}};
async function openSite(url){try{const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 AIHotel/1.0','accept':'text/html,application/xhtml+xml'}});if(!r.ok)return{error:'Сайт вернул HTTP '+r.status};return{url:r.url,html:await r.text()}}catch(e){return{error:'Не удалось открыть сайт: '+(e&&e.message||String(e))}}}
export default async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'POST only'});
  try{
    const body=await readBody(req);
    if(!body||!body.url)return send(res,400,{error:'url required'});
    let url=String(body.url).trim();if(!/^https?:\\/\\//i.test(url))url='https://'+url;
    const page=await openSite(url);if(page.error)return send(res,502,{error:page.error});
    const html=page.html||'';const finalUrl=page.url||url;const md=meta(html);const ld=candidateFromLd(html);
    const titleMatch=html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i);const title=strip(titleMatch?titleMatch[1]:'')||new URL(finalUrl).hostname;
    const txt=fromText(html,title);
    const host=new URL(finalUrl).hostname.replace(/^www\\./,'');
    const hotel={
      name:(ld&&ld.name)||md['og:site_name']||title.split('|')[0].split(' - ')[0].trim(),
      url:finalUrl,host,
      city:(ld&&ld.city)||md.addresslocality||md['og:locality']||txt.city||null,
      country:(ld&&ld.country)||country(md.addresscountry||md['og:country-name']||txt.country)||null,
      stars:(ld&&ld.stars)||null,rooms:(ld&&ld.rooms)||null,
      address:((ld&&ld.street)||md['street-address']||txt.street||'')+(ld&&ld.postal?', '+ld.postal:'')
    };
    if(!hotel.city||!hotel.country){
      return send(res,422,{error:'Не удалось определить город и страну автоматически. На официальном сайте не найден однозначный адрес.',hotel,debug:{title,htmlLength:html.length}});
    }
    return send(res,200,{hotel,crawl:{title,textSample:strip(html).slice(0,1800),checkedPages:1}});
  }catch(e){
    return send(res,500,{error:'Ошибка обработки сайта: '+(e&&e.message||String(e))});
  }
}