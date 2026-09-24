import { env } from "@/lib/env";
import { requireIdentity,ensureUser } from "@/lib/auth";
import { ensureSources,collect } from "@/lib/sources";
import { prepareWeekly,sendDigest } from "@/lib/weekly";
import { getDb } from "@/db";
import { saveCollectionSchedule } from "@/lib/schedule";

const json=(v:unknown,status=200)=>Response.json(v,{status});
const str=(v:unknown,max=500)=>String(v??"").trim().slice(0,max);
const list=(v:unknown)=>Array.isArray(v)?v.map(x=>str(x,70)).filter(Boolean).slice(0,30):[];
const sourceGroups=["Безопасность ИИ","Реальные угрозы","Прикладная безопасность","Развитие ИИ","Независимый взгляд","Российский контекст ИБ","Предложенные"];
function safeSource(value:string){
 try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password||u.port||u.hostname.includes("localhost")||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||u.hostname.endsWith(".local"))return null;
  if(["x.com","twitter.com"].some(host=>u.hostname===host||u.hostname.endsWith(`.${host}`)))return "unsupported";
  u.hash="";return u.href;
 }catch{return null}
}
function monitoredUrl(value:string,kind:string){
 const url=safeSource(value);
 if(!url||url==="unsupported"||kind!=="telegram")return url;
 const parsed=new URL(url),match=parsed.pathname.match(/^\/(?:s\/)?([A-Za-z0-9_]{5,32})\/?$/);
 if(parsed.hostname!=="t.me"||!match)return null;
 return `https://t.me/s/${match[1]}`;
}
export async function POST(request:Request){
 if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return json({error:"Недопустимый источник запроса"},403);
 let data:Record<string,unknown>;try{data=await request.json()}catch{return json({error:"Неверные данные"},400)}
 try{
 const identity=await requireIdentity();await ensureUser(identity);await ensureSources();const db=getDb();const action=str(data.action,60);
 if(action==="settings"){
  const language=data.language==="en"?"en":"ru",topics=list(data.topics),sources=list(data.sources),digest=data.digest===true?1:0;
  await db.prepare("UPDATE users SET language=?,topics=?,sources=?,digest=? WHERE id=?").bind(language,JSON.stringify(topics),JSON.stringify(sources),digest,identity.id).run();return json({ok:true});
 }
 if(action==="feedback"){
  const storyId=str(data.storyId,80);
  const story=await db.prepare("SELECT id FROM stories WHERE id=? AND state='published'").bind(storyId).first();if(!story)return json({error:"Карточка не найдена"},404);
  if(data.viewed===true){
   await db.prepare("INSERT INTO feedback(user_id,story_id,viewed_at) VALUES(?,?,?) ON CONFLICT(user_id,story_id) DO UPDATE SET viewed_at=COALESCE(feedback.viewed_at,excluded.viewed_at)").bind(identity.id,storyId,Date.now()).run();return json({ok:true});
  }
  const prior=await db.prepare("SELECT rating,saved FROM feedback WHERE user_id=? AND story_id=?").bind(identity.id,storyId).first<{rating:string|null;saved:number}>();
  const rating=data.rating===undefined?(prior?.rating||null):["useful","uninteresting"].includes(str(data.rating))?str(data.rating):null;
  const saved=data.saved===undefined?(prior?.saved||0):data.saved===true?1:0;
  const viewedAt=data.markRead===true?Date.now():null;
  await db.prepare("INSERT INTO feedback(user_id,story_id,rating,saved,viewed_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,story_id) DO UPDATE SET rating=excluded.rating,saved=excluded.saved,viewed_at=COALESCE(feedback.viewed_at,excluded.viewed_at)").bind(identity.id,storyId,rating,saved,viewedAt).run();return json({ok:true});
 }
 if(action==="suggest"){
  const url=safeSource(str(data.url,700));if(url==="unsupported")return json({error:"X/Twitter пока не поддерживается"},400);if(!url)return json({error:"Нужна публичная ссылка https"},400);
  await db.prepare("INSERT INTO suggestions(id,user_id,url,status,created_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),identity.id,url,"pending",Date.now()).run();return json({ok:true});
 }
 if(identity.role!=="admin")return json({error:"Недостаточно прав"},403);
 if(action==="collectionSchedule"){
  try{return json({schedule:await saveCollectionSchedule({mode:data.mode,days:data.days,time:data.time})})}
  catch(e){return json({error:e instanceof Error?e.message:"Некорректное расписание"},400)}
 }
 if(action==="reviewSuggestion"){
  const id=str(data.id,80),approved=data.approved===true,reason=str(data.reason,200);
  const suggestion=await db.prepare("SELECT * FROM suggestions WHERE id=? AND status='pending'").bind(id).first<{url:string}>();if(!suggestion)return json({error:"Заявка не найдена"},404);
  await db.prepare("UPDATE suggestions SET status=?,reason=? WHERE id=?").bind(approved?"approved":"rejected",reason||null,id).run();
  if(approved){const url=suggestion.url;const kind=url.includes("t.me/")?"telegram":/\.xml$|\/(?:rss|atom|feed)\/?$/.test(url)?"rss":"web";const name=new URL(url).hostname;
   const removed=await db.prepare("SELECT id FROM sources WHERE url=? AND status='removed'").bind(url).first<{id:string}>();
   if(removed)await db.prepare("UPDATE sources SET name=?,kind=?,group_name='Предложенные',enabled=1,status='pending',error=NULL,last_checked=NULL WHERE id=?").bind(name,kind,removed.id).run();
   else await db.prepare("INSERT OR IGNORE INTO sources(id,name,url,kind,group_name,status,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),name,url,kind,"Предложенные", "pending",Date.now()).run();}
  return json({ok:true});
 }
 if(action==="sourceCreate"||action==="sourceUpdate"){
  const name=str(data.name,120),kind=str(data.kind,20),group=str(data.group,80),url=monitoredUrl(str(data.url,700),kind);
  if(!name)return json({error:"Укажите название источника"},400);
  if(url==="unsupported")return json({error:"X/Twitter пока не поддерживается"},400);
  if(!url)return json({error:"Нужна публичная ссылка https"},400);
  if(!["web","rss","telegram","json"].includes(kind)||!sourceGroups.includes(group))return json({error:"Выберите тип и рубрику источника"},400);
  if(action==="sourceCreate"){
   const existing=await db.prepare("SELECT id,status FROM sources WHERE url=?").bind(url).first<{id:string;status:string}>();
   if(existing?.status==="removed")await db.prepare("UPDATE sources SET name=?,kind=?,group_name=?,enabled=1,status='pending',error=NULL,last_checked=NULL WHERE id=?").bind(name,kind,group,existing.id).run();
   else if(existing)return json({error:"Этот источник уже добавлен"},409);
   else await db.prepare("INSERT INTO sources(id,name,url,kind,group_name,enabled,status,created_at) VALUES(?,?,?,?,?,1,'pending',?)").bind(crypto.randomUUID(),name,url,kind,group,Date.now()).run();
   return json({ok:true});
  }
  const id=str(data.id,80),original=await db.prepare("SELECT url,kind FROM sources WHERE id=? AND status!='removed'").bind(id).first<{url:string;kind:string}>();
  if(!original)return json({error:"Источник не найден"},404);
  if(original.url!==url&&await db.prepare("SELECT id FROM sources WHERE url=?").bind(url).first())return json({error:"Этот адрес уже занят другим источником"},409);
  if(original.url!==url||original.kind!==kind)await db.prepare("UPDATE sources SET name=?,url=?,kind=?,group_name=?,status='pending',error=NULL,last_checked=NULL WHERE id=?").bind(name,url,kind,group,id).run();
  else await db.prepare("UPDATE sources SET name=?,group_name=? WHERE id=?").bind(name,group,id).run();
  return json({ok:true});
 }
 if(action==="sourceRemove"){
  const id=str(data.id,80);
  const source=await db.prepare("SELECT id FROM sources WHERE id=? AND status!='removed'").bind(id).first();
  if(!source)return json({error:"Источник не найден"},404);
  await db.prepare("UPDATE sources SET enabled=0,status='removed',error=NULL WHERE id=?").bind(id).run();
  const users=await db.prepare("SELECT id,sources FROM users").all<{id:string;sources:string}>();
  for(const user of users.results){try{const preferred=JSON.parse(user.sources) as string[];if(Array.isArray(preferred)&&preferred.includes(id))await db.prepare("UPDATE users SET sources=? WHERE id=?").bind(JSON.stringify(preferred.filter(x=>x!==id)),user.id).run()}catch{/* Keep unrelated preferences untouched. */}}
  return json({ok:true});
 }
 if(action==="sourceToggle"||action==="source"){
  const id=str(data.id,80),enabled=data.enabled===true?1:0;
  if(!await db.prepare("SELECT id FROM sources WHERE id=? AND status!='removed'").bind(id).first())return json({error:"Источник не найден"},404);
  await db.prepare("UPDATE sources SET enabled=? WHERE id=?").bind(enabled,id).run();return json({ok:true});
 }
 if(action==="story"){
  const id=str(data.id,80),state=["published","hidden","draft"].includes(str(data.state))?str(data.state):"draft";
  await db.prepare("UPDATE stories SET title_ru=?,title_en=?,fact_ru=?,fact_en=?,why_ru=?,why_en=?,action_ru=?,action_en=?,topics=?,status_label=?,important=?,state=? WHERE id=?")
   .bind(str(data.titleRu,300),str(data.titleEn,300),str(data.factRu,2400),str(data.factEn,2400),str(data.whyRu,2400),str(data.whyEn,2400),str(data.actionRu,2400),str(data.actionEn,2400),JSON.stringify(list(data.topics)),str(data.statusLabel,60),data.important===true?1:0,state,id).run();return json({ok:true});
 }
 if(action==="collect")return json({outcomes:await collect(1)});
 if(action==="collectSource"){
  const id=str(data.id,80);
  if(!id)return json({error:"Источник не указан"},400);
  const outcomes=await collect(1,id);
  return outcomes.length?json({outcomes}):json({error:"Источник не найден или отключён"},404);
 }
 if(action==="prepareWeek")return json({week:await prepareWeekly()});
 if(action==="rebuildWeek")return json({week:await prepareWeekly(true)});
 if(action==="publishWeek"){
  await db.prepare("UPDATE weekly SET status='published',body_ru=?,body_en=?,title_ru=?,title_en=? WHERE id=?").bind(str(data.bodyRu,3500),str(data.bodyEn,3500),str(data.titleRu,300),str(data.titleEn,300),str(data.id,30)).run();return json({ok:true});
 }
 if(action==="testDigest")return json({results:await sendDigest(str(data.id,30),identity.id)});
 if(action==="sendWeek")return json({results:await sendDigest(str(data.id,30))});
 if(action==="setupBot"){
  if(!env.TELEGRAM_BOT_TOKEN||!env.CRON_SECRET||!env.SITE_ORIGIN)return json({error:"Нужны токен бота, адрес сайта и секрет заданий"},503);
  const reply=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:`${env.SITE_ORIGIN}/api/bot`,secret_token:env.CRON_SECRET,allowed_updates:["message"]})});
  return json({ok:reply.ok,detail:reply.ok?"Бот подключён":(await reply.text()).slice(0,200)},reply.ok?200:502);
 }
 return json({error:"Неизвестное действие"},400);
 }catch(e){if(e instanceof Response)return e;console.error("Action failed",e);return json({error:e instanceof Error?e.message:"Не удалось выполнить действие"},500)}
}
