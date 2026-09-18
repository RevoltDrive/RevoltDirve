import { Hono } from "hono";

const app = new Hono();

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type":"application/json; charset=utf-8"}
  });
}
function cleanText(s="") { return s.replace(/\s+/g, " ").trim(); }
function absUrl(u, base) { try { return new URL(u, base).href; } catch { return ""; } }

function parseListing(html, sourceUrl) {
  const title = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] ||
                 html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  const description = (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)?.[1] || "").trim();
  const images = [];
  const pushImg = u => { u=absUrl(u,sourceUrl); if(u && !images.includes(u)) images.push(u); };
  for(const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/gi)) pushImg(m[1]);
  for(const m of html.matchAll(/(?:src|data-src|data-image-url)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi)) pushImg(m[1]);

  let vehicle={};
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const x=JSON.parse(m[1].trim()), arr=Array.isArray(x)?x:[x];
      const found=arr.find(o=>/Vehicle|Product|Car/i.test(o?.["@type"]||""));
      if(found){vehicle=found;break;}
    }catch{}
  }
  const price=vehicle?.offers?.price ?? vehicle?.price ?? "";
  const year=vehicle?.vehicleModelDate || vehicle?.productionDate || "";
  const mileage=vehicle?.mileageFromOdometer?.value ?? "";
  const color=vehicle?.color || "";
  const brand=vehicle?.brand?.name || "";
  const model=vehicle?.model || "";
  return {
    title:cleanText(vehicle?.name || title),
    description:cleanText(vehicle?.description || description),
    year:String(year||""), km:mileage?String(mileage):"", color:cleanText(color),
    price_eur:price?Number(String(price).replace(/[^\d.,]/g,"").replace(",",".")):null,
    images:images.slice(0,40), brand:cleanText(brand), model:cleanText(model),
    warnings:[
      images.length?null:"Nepodarilo sa nájsť fotografie automaticky.",
      title?null:"Nepodarilo sa nájsť názov vozidla.",
      price?null:"Nepodarilo sa nájsť cenu – doplň ju ručne."
    ].filter(Boolean)
  };
}

app.get("/api/health", c=>json({ok:true,service:"ReVolt Drive"}));

app.post("/api/import", async c=>{
  const body=await c.req.json().catch(()=>({})), sourceUrl=body.url;
  if(!sourceUrl)return json({error:"Chýba URL inzerátu."},400);
  let u; try{u=new URL(sourceUrl);}catch{return json({error:"Neplatná URL."},400);}
  const allowed=["autoscout24.de","autoscout24.com","mobile.de","suchen.mobile.de"];
  if(!allowed.some(d=>u.hostname===d||u.hostname.endsWith("."+d)))
    return json({error:"Tento zdroj zatiaľ nie je v automatickom importéri povolený."},400);
  try{
    const r=await fetch(u.href,{headers:{"user-agent":"Mozilla/5.0 (compatible; ReVoltDriveImporter/1.0)","accept-language":"de-DE,de;q=0.9,en;q=0.8"}});
    if(!r.ok)return json({error:`Zdroj odpovedal HTTP ${r.status}.`},502);
    const html=await r.text(), parsed=parseListing(html,u.href);
    return json({ok:true,source:u.href,imported:parsed});
  }catch{return json({error:"Import sa nepodaril. Skontroluj URL alebo dostupnosť zdroja."},502);}
});

app.get("/api/cars",async c=>{
  if(!c.env.DB)return c.json({cars:[]});
  const {results=[]}=await c.env.DB.prepare(`
    SELECT id,title,subtitle,year,km,power,range_km,drive,color,price_eur,status,description
    FROM cars ORDER BY created_at DESC
  `).all();
  return c.json({cars:results});
});

app.get("/api/cars/:id",async c=>{
  if(!c.env.DB)return c.json({error:"DB not configured"},503);
  const id=c.req.param("id");
  const car=await c.env.DB.prepare(`
    SELECT id,title,subtitle,year,km,power,range_km,drive,color,price_eur,status,description
    FROM cars WHERE id=?
  `).bind(id).first();
  if(!car)return c.json({error:"Vozidlo nenájdené"},404);
  const {results:equipment=[]}=await c.env.DB.prepare("SELECT item FROM equipment WHERE car_id=? ORDER BY rowid").bind(id).all();
  const {results:photos=[]}=await c.env.DB.prepare("SELECT id,url,position FROM photos WHERE car_id=? ORDER BY position").bind(id).all();
  return c.json({car,equipment:equipment.map(x=>x.item),photos});
});

app.post("/api/cars",async c=>{
  if(!c.env.DB)return c.json({error:"DB nie je nakonfigurovaná."},503);
  const b=await c.req.json(), id=b.id||crypto.randomUUID();
  if(!b.title)return c.json({error:"Názov je povinný."},400);
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO cars
    (id,title,subtitle,year,km,power,range_km,drive,color,price_eur,purchase_price_eur,status,description,source_url,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
  `).bind(id,b.title,b.subtitle||"",b.year||"",b.km||"",b.power||"",b.range_km||"",b.drive||"",b.color||"",
    Number(b.price_eur)||0,Number(b.purchase_price_eur)||0,b.status||"available",b.description||"",b.source_url||"").run();
  await c.env.DB.prepare("DELETE FROM equipment WHERE car_id=?").bind(id).run();
  for(const item of (b.equipment||[])) if(item) await c.env.DB.prepare("INSERT INTO equipment(car_id,item) VALUES(?,?)").bind(id,item).run();
  await c.env.DB.prepare("DELETE FROM photos WHERE car_id=?").bind(id).run();
  for(let i=0;i<(b.images||[]).length;i++) await c.env.DB.prepare("INSERT INTO photos(id,car_id,url,position,processed) VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(),id,b.images[i],i,0).run();
  return c.json({ok:true,id});
});

app.patch("/api/cars/:id",async c=>{
  if(!c.env.DB)return c.json({error:"DB nie je nakonfigurovaná."},503);
  const id=c.req.param("id"), b=await c.req.json(), allowed=["title","subtitle","year","km","power","range_km","drive","color","price_eur","status","description"];
  const sets=[],vals=[];
  for(const k of allowed)if(k in b){sets.push(`${k}=?`);vals.push(k==="price_eur"?Number(b[k]):b[k]);}
  if(!sets.length)return c.json({ok:true});
  sets.push("updated_at=CURRENT_TIMESTAMP");
  await c.env.DB.prepare(`UPDATE cars SET ${sets.join(",")} WHERE id=?`).bind(...vals,id).run();
  return c.json({ok:true});
});

app.delete("/api/cars/:id",async c=>{
  if(!c.env.DB)return c.json({error:"DB nie je nakonfigurovaná."},503);
  await c.env.DB.prepare("DELETE FROM cars WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ok:true});
});

app.all("*",async c=>c.env.ASSETS.fetch(c.req.raw));
export default app;