const j=(res,s,b)=>{res.statusCode=s;res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(b))};
const read=async req=>{let x='';for await(const c of req)x+=c;return x?JSON.parse(x):{}};
const strip=x=>String(x||'').replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim();
const clean=x=>String(x??'').replace(/\\s+/g,' ').trim()||null;

function countryName(x){
  const v=clean(typeof x==='object'?(x.name||x.code):x); if(!v)return null;
  const m={CZ:'Czechia',CS:'Czechia',CY:'Cyprus',GR:'Greece',ES:'Spain',IT:'Italy',FR:'France',DE:'Germany',AT:'Austria',PT:'Portugal',TR:'Türkiye',GB:'United Kingdom',UK:'United Kingdom',US:'United States',AE:'United Arab Emirates',HR:'Croatia',MT:'Malta',PL:'Poland',SK:'Slovakia'};
  return m[v.toUpperCase()]||v;
}
function flattenJsonLd(v,out=[]){
  if(!v)return out;
  if(Array.isArray(v)){for(const x of v)flattenJsonLd(x,out);return out}
  if(typeof v==='object'){
    if(v['@graph'])flattenJsonLd(v['@graph'],out);
    out.push(v);
  }
  return out;
}
function typeHas(x,t){const v=x&&x['@type'];return Array.isArray(v)?v.some(y=>String(y).toLowerCase().includes(t.toLowerCase())):String(v||'').toLowerCase().includes(t.toLowerCase())}
function addrCandidates(x){
  const a=[];
  const push=v=>{if(v&&typeof v==='object')a.push(v)};
  push(x&&x.address);
  push(x&&x.location&&x.location.address);
  push(x&&x.contactPoint&&x.contactPoint.address);
  if(x&&Array.isArray(x.location))x.location.forEach(z=>push(z&&z.address));
  if(x&&Array.isArray(x.addresses))x.addresses.forEach(push);
  return a;
}
function extractFromHtml(html){
  const candidates=[];
  let ld=[];
  for(const m of html.matchAll(/<script[^>]*type=[\\"']application\\/ld\\+json[\\"'][^>]*>([\\s\\S]*?)<\\/script>/gi)){
    try{ld.push(...flattenJsonLd(JSON.parse(m[1])))}catch{}
  }
  for(const x of ld){
    if(typeHas(x,'hotel')||typeHas(x,'resort')||typeHas(x,'lodging')||x.name||x.address){
      for(const a of addrCandidates(x)){
        candidates.push({
          name:clean(x.name),
          city:clean(a.addressLocality||a.city),
          country:countryName(a.addressCountry||a.country),
          street:clean(a.streetAddress),
          postal:clean(a.postalCode)
        });
      }
    }
  }

  const meta={};
  for(const m of html.matchAll(/<meta\\b[^>]*>/gi)){
    const tag=m[0], n=(tag.match(/(?:name|property|itemprop)=[\\"']([^\\"']+)[\\"']/i)||[])[1], c=(tag.match(/content=[\\"']([^\\"']*)[\\"']/i)||[])[1];
    if(n&&c)meta[n.toLowerCase()]=clean(c);
  }
  const locality=meta['addresslocality']||meta['og:locality']||meta['hotel:contact_data:locality']||meta['geo.placename'];
  const country=countryName(meta['addresscountry']||meta['og:country-name']||meta['hotel:contact_data:country_name']||meta['country']||meta['geo.country']);
  if(locality||country)candidates.push({city:locality||null,country:country||null,street:meta['street-address']||meta['address']||null,postal:meta['postal-code']||null,name:meta['og:site_name']||null});

  const item=(prop)=>{const re=new RegExp('<[^>]*\\\\bitemprop=[\\\\"\\\\\']'+prop+'[\\\\"\\\\\'][^>]*>([\\\\s\\S]*?)<\\\\/[^>]+>','i');const z=html.match(re);return z?clean(strip(z[1])):null};
  const ic=item('addressLocality'), ico=countryName(item('addressCountry'));
  if(ic||ico)candidates.push({city:ic,country:ico,street:item('streetAddress'),postal:item('postalCode'),name:null});

  for(const x of candidates){
    if(x.city&&x.country)return x;
  }
  return candidates.find(x=>x.city||x.country)||null;
}

async function geocodeFallback(street,postal,country){
  const q=[street,postal,country].filter(Boolean).join(', ');
  if(!q)return null;
  try{
    const u='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q='+encodeURIComponent(q);
    const r=await fetch(u,{headers:{'user-agent':'AIHotel/1.0 contact: aihotel@example.com','accept':'application/json'}});
    if(!r.ok)return null;
    const a=(await r.json())[0]?.address||{};
    return {city:clean(a.city||a.town||a.village||a.municipality||a.county),country:countryName(a.country_code||a.country),lat:a.lat||null,lon:a.lon||null};
  }catch{return null}
}

async function fetchPage(url){
  try{
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'AIHotel/1.0','accept':'text/html,application/xhtml+xml'}});
    if(!r.ok)return null;
    const html=await r.text();
    return {url:r.url,html};
  }catch{return null}
}

function sameHost(base,href){
  try{return new URL(href,base).hostname.replace(/^www\\./,'')===new URL(base).hostname.replace(/^www\\./,'')}catch{return false}
}
function usefulLink(href,text){
  const s=(href+' '+text).toLowerCase();
  return /(contact|location|where|directions|about|hotel|property|find-us|findus|impressum|contacto|ubicacion|adresse|standort)/i.test(s);
}

export default async function handler(req,res){
  try{
    if(req.method!=='POST')return j(res,405,{error:'POST only'});
    const b=await read(req);
    if(!b.url)return j(res,400,{error:'url required'});

    const first=await fetchPage(b.url);
    if(!first)throw Error('Не удалось открыть сайт');
    let html=first.html, finalUrl=first.url, found=extractFromHtml(html)||{};

    // Crawl a few likely official pages on the same domain when the homepage has incomplete structured data.
    const links=[];
    for(const m of html.matchAll(/<a[^>]+href=[\\"']([^\\"']+)[\\"'][^>]*>([\\s\\S]*?)<\\/a>/gi)){
      const href=m[1], txt=strip(m[2]);
      if(sameHost(finalUrl,href)&&usefulLink(href,txt)){
        try{const u=new URL(href,finalUrl).href; if(!links.includes(u))links.push(u)}catch{}
      }
    }
    const common=['/contact','/contact-us','/location','/about','/about-us','/hotel','/find-us'];
    for(const p of common){try{const u=new URL(p,finalUrl).href;if(!links.includes(u))links.push(u)}catch{}}
    for(const u of links.slice(0,8)){
      if(found.city&&found.country)break;
      const p=await fetchPage(u); if(!p)continue;
      const x=extractFromHtml(p.html);
      if(x){
        found={...found,...Object.fromEntries(Object.entries(x).filter(([,v])=>v))}
        if(found.city&&found.country){html=html+'\\n'+p.html;break}
        html=html+'\\n'+p.html;
      }
    }

    // If the site exposes a full street/postcode but omits locality, resolve it from a public geocoder.
    if((!found.city||!found.country)&&(found.street||found.postal)){
      const g=await geocodeFallback(found.street,found.postal,found.country);
      if(g)found={...found,city:found.city||g.city,country:found.country||g.country,lat:g.lat,lon:g.lon};
    }

    let ld=[]; for(const m of html.matchAll(/<script[^>]*type=[\\"']application\\/ld\\+json[\\"'][^>]*>([\\s\\S]*?)<\\/script>/gi)){try{ld.push(...flattenJsonLd(JSON.parse(m[1])))}catch{}}
    const h=ld.find(x=>typeHas(x,'hotel')||typeHas(x,'resort')||typeHas(x,'lodging'))||ld.find(x=>x.name)||{};
    const a=(addrCandidates(h)[0]||{});
    const title=(html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i)||[])[1]||new URL(finalUrl).hostname;
    const name=found.name||clean(h.name)||strip(title).split('|')[0].split(' - ')[0].trim();
    const host=new URL(finalUrl).hostname.replace(/^www\\./,'');
    const city=clean(found.city||a.addressLocality);
    const country=countryName(found.country||a.addressCountry);

    if(!city||!country){
      return j(res,422,{error:'Не удалось надёжно определить город и страну по официальному сайту.',hotel:{name,url:finalUrl,host,city:city||null,country:country||null,street:found.street||a.streetAddress||null,postal:found.postal||a.postalCode||null},debug:{checkedPages:Math.min(links.length,8)}});
    }

    return j(res,200,{hotel:{
      name,url:finalUrl,host,city,country,
      stars:h.starRating?.ratingValue||h.starRating||null,
      rooms:h.numberOfRooms||null,
      address:[found.street||a.streetAddress,found.postal||a.postalCode,city].filter(Boolean).join(', ')
    },crawl:{title:strip(title),textSample:strip(html).slice(0,1800),checkedPages:Math.min(links.length,8)}});
  }catch(e){return j(res,500,{error:e.message})}
}
