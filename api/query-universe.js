const json=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(data))};
const read=async req=>{let s='';for await(const c of req)s+=c;return s?JSON.parse(s):{}};
const clean=x=>String(x??'').replace(/\s+/g,' ').trim();
const slug=x=>clean(x).toLowerCase();
const n=v=>Math.max(0,Math.min(100,Number(v)||0));

function hotelFacts(h,content){
 const rooms=content?.rooms||[],rests=content?.restaurants||[],menus=content?.menus||[],services=content?.services||[],fac=content?.facilities||[],near=content?.nearby||[],p=content?.policies||{},b=content?.basics||{};
 const categories=[];
 if(b.category||h.stars||h.city)categories.push('luxury positioning');
 if(rooms.length)categories.push('rooms');
 if(rests.length||menus.length)categories.push('dining');
 if(services.length)categories.push('services');
 if(fac.length)categories.push('facilities');
 if(p.children||p.minimumAge||p.pets)categories.push('policies');
 if(near.length||h.city)categories.push('location');
 return {rooms,rests,menus,services,fac,near,p,b,categories};
}

function variants(h,f){
 const city=clean(h.city||'the destination'),name=clean(h.name||'the hotel');
 const out=[];
 const add=(stage,intent,q,needs,fit=70)=>out.push({stage,intent,query:q,needs,fit});
 add('Discovery','Best hotel',`best hotels in ${city}`,'positioning + location',74);
 add('Discovery','Luxury',`best luxury hotels in ${city}`,'category + positioning',86);
 add('Discovery','Couples',`best hotels in ${city} for couples`,'positioning + rooms + dining',85);
 add('Discovery','Adults-only',`best adults-only hotels in ${city}`,'age policy + positioning',92);
 add('Discovery','5-star',`best 5-star hotels in ${city}`,'stars + positioning',88);
 add('Discovery','Romantic',`romantic hotels in ${city}`,'positioning + rooms + experiences',84);
 add('Comparison','Alternative',`good alternatives to ${name}`,'differentiators + competitors',90);
 add('Comparison','Vs competitors',`${name} vs other luxury hotels in ${city}`,'competitor facts + differentiators',92);
 add('Location','Beach',`hotels near the best beaches in ${city}`,'nearby + travel time',90);
 add('Location','Centre',`best hotels near ${city} centre`,'nearby + travel time',82);
 add('Location','Nightlife',`hotels near nightlife in ${city}`,'nearby + travel time',78);
 add('Room','Sea view',`which hotels in ${city} have the best sea view rooms?`,'room view + photos',90);
 add('Room','For two adults',`best room for 2 adults at a hotel in ${city}`,'occupancy + bed + room photos',88);
 add('Room','Suite',`best suites for couples in ${city}`,'suite facts + photos',87);
 add('Room','Amenities',`hotels in ${city} with minibar and wifi in rooms`,'amenities',74);
 add('Dining','Breakfast',`best hotel breakfast in ${city}`,'restaurant + menu',88);
 add('Dining','Gluten-free',`hotels in ${city} with gluten-free dining`,'allergens + dietary',86);
 add('Dining','Vegetarian',`hotels in ${city} with vegetarian menu options`,'menu + dietary',78);
 add('Dining','Late dining',`which hotel restaurants in ${city} are open late?`,'restaurant hours',76);
 add('Dining','Customisation',`can I customise dishes at hotels in ${city}?`,'toppings + modifiers',72);
 add('Services','Airport transfer',`hotels in ${city} with airport transfer`,'transfer price + booking',84);
 add('Services','Spa',`best spa hotels in ${city}`,'spa service + price',84);
 add('Services','Room service',`hotels in ${city} with room service`,'service hours + menu',82);
 add('Services','Late checkout',`hotels in ${city} with late checkout`,'policy + service',70);
 add('Policies','Adults-only policy',`is there an adults-only hotel in ${city}?`,'minimum age + children policy',88);
 add('Policies','Pets',`are pets allowed at hotels in ${city}?`,'pets policy',54);
 add('Policies','Cancellation',`best hotels in ${city} with flexible cancellation`,'rate cancellation rules',77);
 add('Policies','Accessibility',`accessible hotels in ${city}`,'accessibility facts',68);
 add('Nearby','Things to do',`what is near the best hotels in ${city}?`,'nearby + bestFor',73);
 add('Nearby','Airport',`how far are hotels in ${city} from the airport?`,'travel time',74);
 return out;
}

function demandFor(q, provided){
 const key=slug(q);
 const hit=(provided||[]).find(x=>slug(x.query||x.keyword)===key);
 if(hit)return {value:n(hit.volume??hit.demand),source:hit.source||'Imported demand',confidence:'measured'};
 const words=q.toLowerCase().split(/\s+/);
 let value=35;
 if(/best|luxury|adults-only|5-star|romantic/.test(q.toLowerCase()))value+=20;
 if(/hotels|hotel|room|rooms|suite/.test(q.toLowerCase()))value+=12;
 if(/near|beach|centre|airport|spa|breakfast/.test(q.toLowerCase()))value+=8;
 if(/gluten-free|vegetarian|modifier|customise/.test(q.toLowerCase()))value-=2;
 value+=Math.min(10,words.length);
 return {value:n(value),source:'Heuristic until demand source is connected',confidence:'estimated'};
}

function intentScore(stage,intent){
 const high=['Best hotel','Luxury','Couples','Adults-only','Alternative','Vs competitors','Sea view','Breakfast','Airport transfer','Spa','Cancellation'];
 return high.includes(intent)?92:stage==='Discovery'?88:stage==='Room'?84:stage==='Dining'?80:stage==='Services'?78:stage==='Policies'?82:74;
}
function relevanceScore(row,f){
 let r=row.fit;
 const q=row.query.toLowerCase();
 if(q.includes('adults-only')&&String(f.p.minimumAge||f.p.children).length)r+=5;
 if(q.includes('gluten-free')&&f.menus.some(x=>String(x.allergens||x.dietary).length))r+=5;
 if(q.includes('room service')&&f.services.some(x=>slug(x.name).includes('room service')))r+=5;
 if(q.includes('spa')&&f.services.some(x=>slug(x.type||x.name).includes('spa')))r+=5;
 return n(r);
}
function contentCoverage(row,f){
 const need=row.needs.toLowerCase(), checks=[];
 if(need.includes('room'))checks.push(f.rooms.some(x=>x.name),f.rooms.every(x=>x.amenities));
 if(need.includes('photo'))checks.push(f.rooms.some(x=>(x.photos||[]).length>0));
 if(need.includes('restaurant'))checks.push(f.rests.some(x=>x.name&&x.hours&&x.cuisine));
 if(need.includes('menu'))checks.push(f.menus.some(x=>x.name&&x.description&&x.price));
 if(need.includes('allergen')||need.includes('dietary'))checks.push(f.menus.every(x=>x.allergens||x.dietary));
 if(need.includes('topping')||need.includes('modifier'))checks.push(f.menus.every(x=>x.toppings||x.modifiers));
 if(need.includes('service'))checks.push(f.services.some(x=>x.name&&x.description&&x.hours));
 if(need.includes('booking'))checks.push(f.services.every(x=>x.booking||x.bookingUrl));
 if(need.includes('policy'))checks.push(!!f.p.children||!!f.p.minimumAge);
 if(need.includes('competitor'))checks.push(true);
 if(need.includes('nearby')||need.includes('location')||need.includes('travel'))checks.push(f.near.length>0);
 if(!checks.length)checks.push(true);
 return Math.round(checks.filter(Boolean).length/checks.length*100);
}
function competition(stage,intent){
 let x=45;
 if(stage==='Discovery'||stage==='Comparison')x=82;
 if(intent==='Sea view'||intent==='Breakfast'||intent==='Gluten-free'||intent==='Airport transfer')x=72;
 if(intent==='Vs competitors'||intent==='Alternative')x=90;
 return n(x);
}

export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'POST only'});
 try{
  const b=await read(req),hotel=b.hotel||{},content=b.content||{},f=hotelFacts(hotel,content),provided=b.demandData||b.searchDemand||[];
  if(!hotel.city&&!content.basics?.city)return json(res,400,{error:'hotel.city required'});
  const candidates=variants(hotel,f);
  const market=b.market||'Global';
  const rows=candidates.map((x,i)=>{
    const d=demandFor(x.query,provided),intentScoreValue=intentScore(x.stage,x.intent),rel=relevanceScore(x,f),comp=competition(x.stage,x.intent),coverage=contentCoverage(x,f);
    const opportunity=Math.round((d.value*.30+intentScoreValue*.25+rel*.20+comp*.15+(100-coverage)*.10));
    return {...x,rank:0,priorityScore:n(opportunity),demand:d.value,demandSource:d.source,demandConfidence:d.confidence,intentScore:intentScoreValue,relevance:rel,competitivePressure:comp,contentCoverage:coverage,market,sourceMix:{demand:d.source,hotel:'Hotel Knowledge Base',competition:'Query taxonomy / competitor layer'},reason:coverage<70?'High-value scenario but content gaps reduce confidence.':comp>84?'High-value competitive scenario.':d.confidence==='estimated'?'Priority based on market heuristics until demand data is connected.':'Priority backed by imported demand signal.'};
  }).sort((a,b)=>b.priorityScore-a.priorityScore).map((x,i)=>({...x,rank:i+1}));
  const top=rows.slice(0,50);
  return json(res,200,{status:'ok',hotel,generatedAt:new Date().toISOString(),totalCandidates:rows.length,topCount:top.length,scoring:{demand:30,intent:25,relevance:20,competition:15,contentGap:10},sourceStatus:{hotelKnowledge:true,demand:provided.length?'imported':'estimated',searchConsole:'not_connected',googleKeywordPlanner:'not_connected',googleTrends:'not_connected',competitorDiscovery:'heuristic'},candidates:rows,top50:top,note:'Demand is never represented as private AI user-query volume. Until a connected demand source is available, demand values are clearly marked estimated.'});
 }catch(e){return json(res,500,{error:e.message||String(e)})}
}