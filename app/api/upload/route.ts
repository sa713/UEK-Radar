import { env } from "@/lib/env";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import * as cheerio from "cheerio";
import { requireIdentity } from "@/lib/auth";
import { draftInternal,draftPdf } from "@/lib/writing";
import { getDb } from "@/db";

const types:Record<string,string>={pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",md:"text/markdown",markdown:"text/markdown"};
function unxml(s:string){return cheerio.load(`<body>${s}</body>`,{xmlMode:true})("body").text().replace(/\s+/g," ").trim()}
async function extract(bytes:Uint8Array,ext:string){
 if(ext==="md"||ext==="markdown")return new TextDecoder().decode(bytes);
 const zip=await JSZip.loadAsync(bytes);
 if(ext==="docx"){
  const xml=await zip.file("word/document.xml")?.async("string");if(!xml)throw new Error("В DOCX не найден текст");
  return xml.replace(/<\/w:p>/g,"\n").match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|\n/g)?.map(v=>v==="\n"?v:unxml(v)).join("").slice(0,80000)||"";
 }
 const slides=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]));
 const chunks=[];for(const [i,name] of slides.entries()){
  const xml=await zip.file(name)!.async("string");chunks.push(`Слайд ${i+1}: ${[...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(v=>unxml(v[1])).join(" ")}`);
 }
 return chunks.join("\n").slice(0,80000);
}
export async function POST(request:Request){
 try{
  await requireIdentity(true);
  if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:"Недопустимый источник запроса"},{status:403});
  if(!env.OPENAI_API_KEY)return Response.json({error:"Для разбора файла нужен ключ OpenAI API"},{status:503});
  const file=(await request.formData()).get("file");if(!(file instanceof File))return Response.json({error:"Выберите файл"},{status:400});
  const filename=file.name.replace(/[\\/\x00-\x1f]/g,"_").slice(0,180),ext=filename.split(".").pop()?.toLowerCase()||"";
  if(!types[ext])return Response.json({error:"Поддерживаются PDF, DOCX, PPTX и Markdown"},{status:400});
  if(file.size<10||file.size>8*1024*1024)return Response.json({error:"Размер файла: от 10 байт до 8 МБ"},{status:400});
  const bytes=new Uint8Array(await file.arrayBuffer()),id=crypto.randomUUID(),db=getDb();
  const directory=join(env.UPLOAD_PATH||"./data/uploads",id);
  await mkdir(directory,{recursive:true});
  await writeFile(join(directory,filename),bytes,{flag:"wx",mode:0o600});
  await db.prepare("INSERT INTO uploads(id,filename,mime,size,status,created_at) VALUES(?,?,?,?,?,?)").bind(id,filename,types[ext],bytes.length,"processing",Date.now()).run();
  try{
   const cards=ext==="pdf"?await draftPdf(filename,bytes):await draftInternal(filename,await extract(bytes,ext));
   if(cards.length===0)throw new Error("Из файла не удалось получить материал для карточки");
   for(const card of cards){const sid=crypto.randomUUID(),title=String(card.titleRu||filename),url=`demo-file://${sid}`;
    await db.prepare("INSERT INTO stories(id,source_id,scope,url,title_original,title_ru,title_en,fact_ru,fact_en,why_ru,why_en,action_ru,action_en,topics,status_label,body,sources_json,state,demo,upload_id,published_at,discovered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(sid,"internal","bank",url,title,title,String(card.titleEn||title),String(card.factRu||""),String(card.factEn||""),String(card.whyRu||""),String(card.whyEn||""),String(card.actionRu||""),String(card.actionEn||""),JSON.stringify(Array.isArray(card.topics)?card.topics:[]),String(card.status||"Изучить"),null,JSON.stringify([{name:`${filename} · ${String(card.reference||"демонстрационный файл")}`,url:null}]),"draft",1,id,Date.now(),Date.now()).run();
   }
   await db.prepare("UPDATE uploads SET status='review' WHERE id=?").bind(id).run();return Response.json({ok:true,id,cards:cards.length});
  }catch(e){await db.prepare("UPDATE uploads SET status='error',error=? WHERE id=?").bind(e instanceof Error?e.message:"Ошибка обработки",id).run();throw e}
 }catch(e){if(e instanceof Response)return e;console.error("Upload failed",e);return Response.json({error:e instanceof Error?e.message:"Файл не обработан"},{status:500})}
}
