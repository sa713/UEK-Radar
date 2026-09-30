import { env } from "@/lib/env";
import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { getDb } from "@/db";
import { analyzeStory } from "./writing";

export const catalog=[
 ["owasp","OWASP GenAI Security","https://genai.owasp.org/","web","Безопасность ИИ"],
 ["ailab","AI Security Lab","https://t.me/s/aisecuritylab","telegram","Безопасность ИИ"],
 ["cisa","CISA KEV","https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json","json","Реальные угрозы"],
 ["ncsc","NCSC","https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml","rss","Реальные угрозы"],
 ["securelist","Securelist","https://securelist.com/","web","Реальные угрозы"],
 ["portswigger","PortSwigger Research","https://portswigger.net/research/rss","rss","Прикладная безопасность"],
 ["projectzero","Google Project Zero","https://projectzero.google/","web","Прикладная безопасность"],
 ["githubsecurity","GitHub Security Lab","https://securitylab.github.com/","web","Прикладная безопасность"],
 ["anthropic","Anthropic Research","https://www.anthropic.com/research","web","Развитие ИИ"],
 ["openai","OpenAI Newsroom","https://openai.com/news/rss.xml","rss","Развитие ИИ"],
 ["huggingface","Hugging Face Blog","https://huggingface.co/blog/feed.xml","rss","Развитие ИИ"],
 ["simon","Simon Willison","https://simonwillison.net/atom/entries/","rss","Независимый взгляд"],
 ["ainewz","эйай ньюз","https://t.me/s/ai_newz","telegram","Независимый взгляд"],
 ["positive","Positive Technologies","https://t.me/s/Positive_Technologies","telegram","Российский контекст ИБ"],
] as const;
export async function ensureSources(){
 const db=getDb();
 for(const [id,name,url,kind,group] of catalog) await db.prepare("INSERT OR IGNORE INTO sources(id,name,url,kind,group_name,created_at) VALUES(?,?,?,?,?,?)").bind(id,name,url,kind,group,Date.now()).run();
 await db.prepare("UPDATE sources SET url=?,kind='rss',status='pending',error=NULL,last_checked=NULL WHERE id='portswigger' AND url=?").bind("https://portswigger.net/research/rss","https://portswigger.net/research").run();
 await db.prepare("UPDATE sources SET name='OpenAI Newsroom',url=?,kind='rss',status='pending',error=NULL,last_checked=NULL WHERE id='openai' AND url=?").bind("https://openai.com/news/rss.xml","https://openai.com/research/").run();
 await db.prepare("UPDATE sources SET url=?,kind='rss',status='pending',error=NULL,last_checked=NULL WHERE id='simon' AND url=?").bind("https://simonwillison.net/atom/entries/","https://simonwillison.net/").run();
}
type Candidate={url:string,title:string,text:string,date?:number};
type Discovery={candidates:Candidate[];nextCursor?:number;oldestDate?:number};
// These primary reports were published before the Radar's initial short feed window.
// Keep them in discovery so the normal analysis and URL deduplication can backfill them.
const backfill:Record<string,Candidate[]>={
 "https://openai.com/news/rss.xml":[
  {url:"https://openai.com/index/gpt-6-astra/",title:"GPT-6 Astra: A new generation of intelligence",text:"",date:Date.parse("2026-09-03")},
  {url:"https://openai.com/index/hugging-face-incident-and-the-road-ahead/",title:"The Hugging Face incident and the road ahead",text:"",date:Date.parse("2026-08-26")},
 ],
 "https://huggingface.co/blog/feed.xml":[
  {url:"https://huggingface.co/blog/agent-intrusion-technical-timeline",title:"Anatomy of a Frontier Lab Agent Intrusion: A Technical Timeline of the July 2026 Incident",text:"",date:Date.parse("2026-07-27")},
 ],
};
function safeUrl(link:string,base:string){try{const x=new URL(link,base);return x.protocol==="https:"?x.href:null}catch{return null}}
function plain(s:string){return cheerio.load(`<div>${s}</div>`)("div").text().replace(/\s+/g," ").trim()}
function signature(title:string){return new Set(title.toLowerCase().match(/[a-zа-яё0-9]{4,}/g)||[])}
function similar(a:string,b:string){const x=signature(a),y=signature(b);let hits=0;for(const word of x)if(y.has(word))hits++;return hits>=3&&hits/Math.max(1,Math.min(x.size,y.size))>.7}
async function articleText(candidate:Candidate,kind:string){
 if(kind==="json"||kind==="telegram")return {body:candidate.text};
 try{
  const response=await fetch(candidate.url,{headers:{"User-Agent":"UEK-Radar/1.0"},signal:AbortSignal.timeout(9000)});
  if(!response.ok)return {body:candidate.text};
  const $=cheerio.load((await response.text()).slice(0,900000));
  const dateText=$("meta[property='article:published_time']").attr("content")
   ||$("meta[property='og:published_time']").attr("content")
   ||$("meta[itemprop='datePublished']").attr("content")
   ||$("meta[name='date']").attr("content")
   ||$("time[datetime]").first().attr("datetime");
  const parsedDate=Date.parse(dateText||"");
  $("script,style,nav,footer,header,aside,form").remove();
  const body=$("article").first().text()||$("main").first().text()||"";
  return {body:body.replace(/\s+/g," ").slice(0,18000)||candidate.text,date:Number.isFinite(parsedDate)?parsedDate:undefined};
 }catch{return {body:candidate.text}}
}
async function discover(source:{url:string;kind:string},before?:number):Promise<Discovery>{
 const discoveryUrl=before?`${source.url}?before=${before}`:source.url;
 const response=await fetch(discoveryUrl,{headers:{"User-Agent":"UEK-Radar/1.0 (source monitoring; links to origin)",Accept:"text/html,application/rss+xml,application/json"},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error(`HTTP ${response.status}`);
 const raw=await response.text();
 if(source.kind==="json"&&raw.length>12000000)throw new Error("JSON источника превышает лимит 12 МБ");
 const isXml=/^\s*(?:<\?xml\b|<rss\b|<feed\b)/i.test(raw);
 if(isXml&&Buffer.byteLength(raw,"utf8")>12000000)throw new Error("RSS источника превышает лимит 12 МБ");
 // XML must remain complete: truncation can split CDATA and closing tags.
 const content=source.kind==="json"||source.kind==="rss"||isXml?raw:raw.slice(0,700000);
 if(source.kind==="json"){
  const data=JSON.parse(content) as {vulnerabilities?:Array<{cveID:string;vendorProject:string;product:string;dateAdded:string;shortDescription:string;notes:string}>};
  return {candidates:(data.vulnerabilities||[]).reverse().map(v=>({url:`https://www.cisa.gov/known-exploited-vulnerabilities-catalog#${v.cveID}`,title:`${v.cveID}: ${v.vendorProject} ${v.product}`,text:`${v.shortDescription} ${v.notes||""}`,date:Date.parse(v.dateAdded)}))};
 }
 if(source.kind==="telegram"){
  const $=cheerio.load(content);
  const messages=$(".tgme_widget_message").toArray().map(el=>{
   const node=$(el),post=node.attr("data-post")||"",id=Number(post.split("/").pop());
   const text=node.find(".tgme_widget_message_text").text().replace(/\s+/g," ");
   return {id,date:Date.parse(node.find("time").attr("datetime")||""),url:node.find("a.tgme_widget_message_date").attr("href")||"",title:text.slice(0,145),text};
  });
  const ids=messages.map(x=>x.id).filter(x=>Number.isInteger(x)&&x>0),dates=messages.map(x=>x.date).filter(Number.isFinite);
  if(messages.length&&!ids.length)throw new Error("Telegram: не удалось прочитать номера публикаций");
  if(!messages.length&&!before)throw new Error("Telegram: публикации не найдены на открытой странице");
  return {candidates:messages.filter(x=>x.url&&x.text.length>=18).reverse(),nextCursor:ids.length?Math.min(...ids):undefined,oldestDate:dates.length?Math.min(...dates):undefined};
 }
 if(content.trim().startsWith("<?xml")||content.includes("<rss ")||content.includes("<feed ")){
  const parsed=new XMLParser({ignoreAttributes:false}).parse(content);const items=parsed.rss?.channel?.item||parsed.feed?.entry||[];
  const feed=([] as unknown[]).concat(items).map((a)=>{const e=a as Record<string,unknown>;return {url:String(typeof e.link==="object"?(e.link as Record<string,unknown>)["@_href"]:e.link||""),title:plain(String(e.title||"")),text:plain(String(e.description||e.summary||e.content||"")),date:Date.parse(String(e.pubDate||e.published||e.updated||""))}}).filter(x=>x.url&&x.title);
  return {candidates:[...(backfill[source.url]||[]),...feed]};
 }
 const $=cheerio.load(content);const base=new URL(source.url);const list:Candidate[]=[];const seen=new Set<string>();
 $("article a[href], main a[href], .post a[href]").each((_,a)=>{
   const url=safeUrl($(a).attr("href")||"",source.url);const title=$(a).text().replace(/\s+/g," ").trim();
   if(!url||!url.startsWith(base.origin)||url===source.url||seen.has(url)||title.length<22||title.length>190)return;
   const path=new URL(url).pathname;if(path==="/"||/privacy|terms|about|research$|category|tag|subscribe|signup|login/i.test(path))return;
   seen.add(url);list.push({url,title,text:$(a).closest("article").text().replace(/\s+/g," ").slice(0,1200)||title});
 });
 return {candidates:list};
}
type Source={id:string;name:string;url:string;kind:string;group_name:string;last_checked:number|null};
const DAY=86400000;
export async function collect(batch=1,sourceId?:string){
 await ensureSources();const db=getDb(),now=Date.now();
 await db.prepare("UPDATE stories SET state='hidden' WHERE scope='world' AND state='published' AND published_at<?").bind(now-90*DAY).run();
 await db.prepare("DELETE FROM source_queue WHERE status IN ('published','rejected','duplicate') AND updated_at<?").bind(now-120*DAY).run();
 const query="SELECT id,name,url,kind,group_name,last_checked FROM sources WHERE enabled=1";
 const rows=sourceId
  ?await db.prepare(`${query} AND id=? LIMIT 1`).bind(sourceId).all<Source>()
  :await db.prepare(`${query} ORDER BY COALESCE(last_checked,0) ASC LIMIT ?`).bind(batch).all<Source>();
 const outcomes=[];
 for(const source of rows.results){
  try{
   const prior=source.kind==="telegram"?await db.prepare("SELECT before_id,cutoff_at,active,pages FROM source_scans WHERE source_id=?").bind(source.id).first<{before_id:number|null;cutoff_at:number;active:number;pages:number}>():null;
   const cutoff=prior?.active?prior.cutoff_at:now-(source.last_checked?7:30)*DAY;
   let before=prior?.active?prior.before_id||undefined:undefined;
   if(source.kind==="telegram"&&!prior?.active){
    await db.prepare("INSERT INTO source_scans(source_id,before_id,cutoff_at,active,pages,started_at) VALUES(?,?,?,1,0,?) ON CONFLICT(source_id) DO UPDATE SET before_id=NULL,cutoff_at=excluded.cutoff_at,active=1,pages=0,started_at=excluded.started_at").bind(source.id,null,cutoff,now).run();
   }
   let found=0,added=0,continuation=false;
   // Each page is saved before advancing the cursor. A restart can safely reread it.
   for(let page=0;page<(source.kind==="telegram"?6:1);page++){
    const result=await discover(source,before);
    found+=result.candidates.length;
    for(const candidate of result.candidates){
     if(!candidate.url||candidate.title.length<18)continue;
     if(Number.isFinite(candidate.date)&&candidate.date!<cutoff&&!backfill[source.url]?.some(x=>x.url===candidate.url))continue;
     const saved=await db.prepare("INSERT OR IGNORE INTO source_queue(id,source_id,url,title,excerpt,source_date,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM stories WHERE url=?)")
      .bind(crypto.randomUUID(),source.id,candidate.url,candidate.title,candidate.text,Number.isFinite(candidate.date)?candidate.date!:null,now,now,candidate.url).run();
     added+=Number(saved.meta.changes);
    }
    if(source.kind!=="telegram")break;
    const next=result.nextCursor;
    continuation=Boolean(next&&(!before||next<before)&&(!result.oldestDate||result.oldestDate>=cutoff));
    if(!continuation)break;
    before=next;
    await db.prepare("UPDATE source_scans SET retry_at=0,failures=0 WHERE source_id=?").bind(source.id).run();
    await db.prepare("UPDATE source_scans SET before_id=?,pages=pages+1 WHERE source_id=?").bind(before!,source.id).run();
   }
   if(source.kind==="telegram"&&!continuation)await db.prepare("UPDATE source_scans SET active=0,before_id=NULL,retry_at=0,failures=0 WHERE source_id=?").bind(source.id).run();
   if(!continuation&&found)await db.prepare("UPDATE sources SET status='working',error=NULL,last_checked=?,last_success=? WHERE id=?").bind(Date.now(),Date.now(),source.id).run();
   else if(!continuation)await db.prepare("UPDATE sources SET status='pending',error='Не удалось выделить публикации на странице' WHERE id=?").bind(source.id).run();
   else await db.prepare("UPDATE sources SET status='checking',error=NULL WHERE id=?").bind(source.id).run();
   outcomes.push({source:source.name,found,added,queued:added,continuation,warning:!found?"Не удалось выделить публикации на странице":!env.OPENAI_API_KEY?"Для анализа очереди нужен ключ OpenAI API":""});
  }catch(e){const error=e instanceof Error?e.message:String(e);if(source.kind==="telegram")await db.prepare("UPDATE source_scans SET failures=failures+1,retry_at=? WHERE source_id=?").bind(Date.now()+5*60_000,source.id).run();await db.prepare("UPDATE sources SET status='error',error=? WHERE id=?").bind(error.slice(0,250),source.id).run();outcomes.push({source:source.name,error});}
 }
 await db.prepare("INSERT INTO jobs(id,type,status,detail,created_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),"collect","done",JSON.stringify(outcomes),Date.now()).run();
 return outcomes;
}

type QueueRow={id:string;source_id:string;url:string;title:string;excerpt:string;source_date:number|null;attempts:number;lease_id:string;kind:string;name:string};
export async function processQueue(){
 if(!env.OPENAI_API_KEY)return {processed:false,reason:"OPENAI_API_KEY is missing"};
 const db=getDb(),now=Date.now(),lease=crypto.randomUUID();
 // A timed-out HTTP request may have ended after the claim. Only the current
 // lease can commit its result; unfinished work becomes eligible again.
 const row=db.transaction(raw=>{
  raw.prepare("UPDATE source_queue SET status='retry',lease_id=NULL,next_attempt_at=? WHERE status='processing' AND claimed_at<?").run(now,now-10*60_000);
  const claimed=raw.prepare("UPDATE source_queue SET status='processing',lease_id=?,claimed_at=?,attempts=attempts+1,updated_at=? WHERE id=(SELECT q.id FROM source_queue q JOIN sources s ON s.id=q.source_id WHERE s.enabled=1 AND q.status IN ('pending','retry') AND q.next_attempt_at<=? ORDER BY q.created_at,q.id LIMIT 1) RETURNING *").get(lease,now,now,now) as Omit<QueueRow,"kind"|"name">|undefined;
  if(!claimed)return null;
  const source=raw.prepare("SELECT kind,name FROM sources WHERE id=?").get(claimed.source_id) as {kind:string;name:string};
  return {...claimed,...source} as QueueRow;
 });
 if(!row)return {processed:false};
 try{
  const existing=await db.prepare("SELECT id FROM stories WHERE url=?").bind(row.url).first();
  if(existing){await db.prepare("UPDATE source_queue SET status='duplicate',lease_id=NULL,updated_at=? WHERE id=? AND lease_id=?").bind(Date.now(),row.id,lease).run();return {processed:true,status:"duplicate"}}
  const article=await articleText({url:row.url,title:row.title,text:row.excerpt},row.kind);
  const sourceDate=row.source_date||article.date;
  if(article.body.replace(/\s+/g,"").length<120)throw new Error("Недостаточно текста для анализа публикации");
  if(sourceDate&&sourceDate<Date.now()-90*DAY){
   db.transaction(raw=>raw.prepare("UPDATE source_queue SET status='rejected',lease_id=NULL,error='Older than 90 days',updated_at=? WHERE id=? AND lease_id=?").run(Date.now(),row.id,lease));
   return {processed:true,status:"rejected"};
  }
  const analysis=await analyzeStory({title:row.title,body:article.body,url:row.url,source:row.name},row.kind==="telegram"?"low":undefined);
  let status="rejected";
  db.transaction(raw=>{
   const current=raw.prepare("SELECT id FROM source_queue WHERE id=? AND status='processing' AND lease_id=?").get(row.id,lease);
   if(!current)return;
   if(analysis){
    const existing=raw.prepare("SELECT id FROM stories WHERE url=?").get(row.url) as {id:string}|undefined;
    const recent=raw.prepare("SELECT id,title_original,sources_json FROM stories WHERE scope='world' AND discovered_at>? ORDER BY discovered_at DESC LIMIT 60").all(Date.now()-14*DAY) as Array<{id:string;title_original:string;sources_json:string}>;
    const match=recent.find(s=>similar(s.title_original,row.title));
    if(existing||match){
     if(match&&!existing){const links=JSON.parse(match.sources_json) as Array<{name:string;url:string}>;if(!links.some(x=>x.url===row.url)){links.push({name:row.name,url:row.url});raw.prepare("UPDATE stories SET sources_json=? WHERE id=?").run(JSON.stringify(links),match.id)}}
     status="duplicate";
    }else{
     const id=crypto.randomUUID(),published=sourceDate||Date.now();
     raw.prepare(`INSERT INTO stories(id,source_id,scope,url,title_original,title_ru,title_en,fact_ru,fact_en,why_ru,why_en,action_ru,action_en,topics,status_label,body,sources_json,state,published_at,discovered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,row.source_id,"world",row.url,row.title,analysis.titleRu,analysis.titleEn,analysis.factRu,analysis.factEn,analysis.whyRu,analysis.whyEn,analysis.actionRu,analysis.actionEn,JSON.stringify(analysis.topics),analysis.status,article.body,JSON.stringify([{name:row.name,url:row.url}]),"published",published,Date.now());
     status="published";
    }
   }
   raw.prepare("UPDATE source_queue SET status=?,lease_id=NULL,error=NULL,updated_at=? WHERE id=? AND lease_id=?").run(status,Date.now(),row.id,lease);
  });
  return {processed:true,status};
 }catch(e){
  const error=(e instanceof Error?e.message:String(e)).slice(0,250),failed=row.attempts>=5;
  await db.prepare("UPDATE source_queue SET status=?,lease_id=NULL,error=?,next_attempt_at=?,updated_at=? WHERE id=? AND lease_id=?")
   .bind(failed?"failed":"retry",error,Date.now()+Math.min(6*60*60_000,60_000*5**(row.attempts-1)),Date.now(),row.id,lease).run();
  return {processed:true,status:failed?"failed":"retry",error};
 }
}
export async function pendingDiscovery(){
 const row=await getDb().prepare("SELECT s.id FROM source_scans x JOIN sources s ON s.id=x.source_id WHERE x.active=1 AND x.retry_at<=? AND s.enabled=1 ORDER BY x.started_at LIMIT 1").bind(Date.now()).first<{id:string}>();
 return row?collect(1,row.id):[];
}
export async function retryFailedQueue(){
 return getDb().prepare("UPDATE source_queue SET status='retry',attempts=0,next_attempt_at=0,error=NULL,updated_at=? WHERE status='failed'").bind(Date.now()).run();
}
