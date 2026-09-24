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
async function discover(source:{url:string;kind:string}):Promise<Candidate[]>{
 const response=await fetch(source.url,{headers:{"User-Agent":"UEK-Radar/1.0 (source monitoring; links to origin)",Accept:"text/html,application/rss+xml,application/json"},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error(`HTTP ${response.status}`);
 const raw=await response.text();
 if(source.kind==="json"&&raw.length>12000000)throw new Error("JSON источника превышает лимит 12 МБ");
 const content=source.kind==="json"?raw:raw.slice(0,700000);
 if(source.kind==="json"){
  const data=JSON.parse(content) as {vulnerabilities?:Array<{cveID:string;vendorProject:string;product:string;dateAdded:string;shortDescription:string;notes:string}>};
  return (data.vulnerabilities||[]).slice(-8).reverse().map(v=>({url:`https://www.cisa.gov/known-exploited-vulnerabilities-catalog#${v.cveID}`,title:`${v.cveID}: ${v.vendorProject} ${v.product}`,text:`${v.shortDescription} ${v.notes||""}`,date:Date.parse(v.dateAdded)}));
 }
 if(source.kind==="telegram"){
  const $=cheerio.load(content);
  return $(".tgme_widget_message").toArray().slice(-12).reverse().map(el=>{
   const node=$(el);return {url:node.find("a.tgme_widget_message_date").attr("href")||"",title:node.find(".tgme_widget_message_text").text().replace(/\s+/g," ").slice(0,145),text:node.find(".tgme_widget_message_text").text().replace(/\s+/g," "),date:Date.parse(node.find("time").attr("datetime")||"")};
  }).filter(x=>x.url&&x.text.length>80);
 }
 if(content.trim().startsWith("<?xml")||content.includes("<rss ")||content.includes("<feed ")){
  const parsed=new XMLParser({ignoreAttributes:false}).parse(content);const items=parsed.rss?.channel?.item||parsed.feed?.entry||[];
  const feed=([] as unknown[]).concat(items).slice(0,80).map((a)=>{const e=a as Record<string,unknown>;return {url:String(typeof e.link==="object"?(e.link as Record<string,unknown>)["@_href"]:e.link||""),title:plain(String(e.title||"")),text:plain(String(e.description||e.summary||e.content||"")),date:Date.parse(String(e.pubDate||e.published||e.updated||""))}}).filter(x=>x.url&&x.title);
  return [...(backfill[source.url]||[]),...feed];
 }
 const $=cheerio.load(content);const base=new URL(source.url);const list:Candidate[]=[];const seen=new Set<string>();
 $("article a[href], main a[href], .post a[href]").each((_,a)=>{
   const url=safeUrl($(a).attr("href")||"",source.url);const title=$(a).text().replace(/\s+/g," ").trim();
   if(!url||!url.startsWith(base.origin)||url===source.url||seen.has(url)||title.length<22||title.length>190)return;
   const path=new URL(url).pathname;if(path==="/"||/privacy|terms|about|research$|category|tag|subscribe|signup|login/i.test(path))return;
   seen.add(url);list.push({url,title,text:$(a).closest("article").text().replace(/\s+/g," ").slice(0,1200)||title});
 });
 return list.slice(0,12);
}
export async function collect(batch=1,sourceId?:string){
 await ensureSources();const db=getDb();
 await db.prepare("UPDATE stories SET state='hidden' WHERE scope='world' AND state='published' AND published_at<?").bind(Date.now()-90*86400000).run();
 const query="SELECT id,name,url,kind,group_name FROM sources WHERE enabled=1";
 const rows=sourceId
  ?await db.prepare(`${query} AND id=? LIMIT 1`).bind(sourceId).all<{id:string;name:string;url:string;kind:string;group_name:string}>()
  :await db.prepare(`${query} ORDER BY COALESCE(last_checked,0) ASC LIMIT ?`).bind(batch).all<{id:string;name:string;url:string;kind:string;group_name:string}>();
 const outcomes=[];
 for(const source of rows.results){
  try{
   const candidates=await discover(source);let added=0;
   const maxAdded=source.kind==="telegram"?2:3;
   for(const candidate of candidates){
    if(added>=maxAdded)break;
    if(!candidate.url||candidate.title.length<18)continue;
    if(typeof candidate.date==="number"&&Number.isFinite(candidate.date)&&candidate.date<Date.now()-90*86400000)continue;
    const existing=await db.prepare("SELECT id FROM stories WHERE url=?").bind(candidate.url).first();if(existing)continue;
    if(!env.OPENAI_API_KEY)continue;
    const article=await articleText(candidate,source.kind);
    const sourceDate=Number.isFinite(candidate.date)?candidate.date:article.date;
    if(typeof sourceDate==="number"&&sourceDate<Date.now()-90*86400000)continue;
    const analysis=await analyzeStory({title:candidate.title,body:article.body,url:candidate.url,source:source.name},source.kind==="telegram"?"low":undefined);
    if(!analysis)continue;
    const recent=await db.prepare("SELECT id,title_original,sources_json FROM stories WHERE scope='world' AND discovered_at>? ORDER BY discovered_at DESC LIMIT 60").bind(Date.now()-14*86400000).all<{id:string;title_original:string;sources_json:string}>();
    const match=recent.results.find(s=>similar(s.title_original,candidate.title));
    if(match){const links=JSON.parse(match.sources_json) as Array<{name:string;url:string}>;if(!links.some(s=>s.url===candidate.url)){links.push({name:source.name,url:candidate.url});await db.prepare("UPDATE stories SET sources_json=? WHERE id=?").bind(JSON.stringify(links),match.id).run()}continue}
    const id=crypto.randomUUID(),now=Date.now();
    await db.prepare(`INSERT OR IGNORE INTO stories(id,source_id,scope,url,title_original,title_ru,title_en,fact_ru,fact_en,why_ru,why_en,action_ru,action_en,topics,status_label,body,sources_json,state,published_at,discovered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,source.id,"world",candidate.url,candidate.title,analysis.titleRu,analysis.titleEn,analysis.factRu,analysis.factEn,analysis.whyRu,analysis.whyEn,analysis.actionRu,analysis.actionEn,JSON.stringify(analysis.topics),analysis.status,article.body,JSON.stringify([{name:source.name,url:candidate.url}]),"published",sourceDate||now,now).run();added++;
   }
   const msg=!env.OPENAI_API_KEY?"Сбор работает; для анализа нужен ключ OpenAI API":candidates.length===0?"На странице не удалось выделить материалы":"";
   await db.prepare("UPDATE sources SET status=?,error=?,last_checked=?,last_success=? WHERE id=?").bind(msg?"pending":"working",msg||null,Date.now(),Date.now(),source.id).run();
   outcomes.push({source:source.name,found:candidates.length,added,warning:msg});
  }catch(e){const error=e instanceof Error?e.message:String(e);await db.prepare("UPDATE sources SET status='error',error=?,last_checked=? WHERE id=?").bind(error.slice(0,250),Date.now(),source.id).run();outcomes.push({source:source.name,error});}
 }
 await db.prepare("INSERT INTO jobs(id,type,status,detail,created_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),"collect","done",JSON.stringify(outcomes),Date.now()).run();
 return outcomes;
}
