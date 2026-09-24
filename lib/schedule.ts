import { getDb } from "@/db";
import { ensureSources, collect } from "@/lib/sources";
import { moscowClock, isCollectionDue, type CollectionSchedule } from "./moscow-schedule";

export async function getCollectionSchedule(): Promise<CollectionSchedule> {
 const row = await getDb().prepare("SELECT mode,days,time_msk,updated_at FROM collection_schedule WHERE id=1").first<{mode:"daily"|"selected";days:string;time_msk:string;updated_at:number}>();
 if (!row) throw new Error("Настройка расписания не найдена. Примените миграции.");
 return {mode:row.mode,days:JSON.parse(row.days) as number[],time_msk:row.time_msk,updated_at:row.updated_at};
}

export async function saveCollectionSchedule(input: {mode:unknown;days:unknown;time:unknown}) {
 const mode=input.mode, time=input.time;
 const days=Array.isArray(input.days)?[...new Set(input.days)]:[];
 if(mode!=="daily"&&mode!=="selected")throw new Error("Выберите ежедневный запуск или дни недели");
 if(typeof time!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error("Укажите время по Москве в формате ЧЧ:ММ");
 if(days.some(d=>!Number.isInteger(d)||d<1||d>7)||(mode==="selected"&&days.length===0))throw new Error("Выберите хотя бы один день недели");
 const normalized=mode==="daily"?[1,2,3,4,5,6,7]:days.sort((a,b)=>a-b);
 await getDb().prepare("UPDATE collection_schedule SET mode=?,days=?,time_msk=?,updated_at=? WHERE id=1").bind(mode,JSON.stringify(normalized),time,Date.now()).run();
 return getCollectionSchedule();
}

export async function mondayCollectionPending() {
 const clock=moscowClock();
 if(clock.day!==1)return false;
 const schedule=await getCollectionSchedule();
 if(schedule.mode==="selected"&&!schedule.days.includes(1))return false;
 const run=await getDb().prepare("SELECT status FROM collection_runs WHERE slot=?").bind(clock.date).first<{status:string}>();
 return !run||run.status==="running";
}

export async function scheduledCollectionStep() {
 const db=getDb(),schedule=await getCollectionSchedule(),clock=moscowClock();
 if(!isCollectionDue(schedule,clock))return {due:false,active:false,remaining:0};
 await ensureSources();
 const slot=clock.date,now=Date.now();
 db.transaction(raw=>{
  const inserted=raw.prepare("INSERT OR IGNORE INTO collection_runs(slot,status,total,started_at) SELECT ?,'running',COUNT(*),? FROM sources WHERE enabled=1").run(slot,now);
  if(inserted.changes)raw.prepare("INSERT INTO collection_run_sources(slot,source_id,status) SELECT ?,id,'pending' FROM sources WHERE enabled=1").run(slot);
 });
 const run=await db.prepare("SELECT status FROM collection_runs WHERE slot=?").bind(slot).first<{status:string}>();
 if(run?.status!=="running")return {due:true,active:false,remaining:0,slot,status:run?.status};
 // Recover a request that was interrupted after taking a source. A single
 // source normally needs less than three minutes, so ten minutes is stale.
 await db.prepare("UPDATE collection_run_sources SET status='pending' WHERE slot=? AND status='running' AND claimed_at<?").bind(slot,now-10*60_000).run();
 const claimed=await db.prepare("UPDATE collection_run_sources SET status='running',claimed_at=?,attempts=attempts+1 WHERE slot=? AND source_id=(SELECT source_id FROM collection_run_sources WHERE slot=? AND status='pending' ORDER BY source_id LIMIT 1) RETURNING source_id,attempts").bind(now,slot,slot).first<{source_id:string;attempts:number}>();
 if(claimed){
  let added=0,error:string|null=null;
  try{
   const outcome=(await collect(1,claimed.source_id))[0];
   if(!outcome)error="Источник выключен или удалён после начала сбора";
   else if("error" in outcome)error=String(outcome.error).slice(0,250);
   else added=outcome.added||0;
  }catch(e){error=(e instanceof Error?e.message:String(e)).slice(0,250)}
  await db.prepare("UPDATE collection_run_sources SET status=?,added=?,error=? WHERE slot=? AND source_id=?").bind(error?(claimed.attempts<2?"pending":"error"):"done",added,error,slot,claimed.source_id).run();
 }
 const tally=await db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) checked,SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) errors,SUM(added) added,SUM(CASE WHEN status IN ('pending','running') THEN 1 ELSE 0 END) remaining FROM collection_run_sources WHERE slot=?").bind(slot).first<{total:number;checked:number;errors:number;added:number;remaining:number}>();
 const total=tally?.total||0,checked=tally?.checked||0,errors=tally?.errors||0,added=tally?.added||0,remaining=tally?.remaining||0;
 await db.prepare("UPDATE collection_runs SET checked=?,added=?,errors=? WHERE slot=?").bind(checked,added,errors,slot).run();
 if(remaining===0){
  const status=errors?"partial":"done";
  const finished=await db.prepare("UPDATE collection_runs SET status=?,finished_at=? WHERE slot=? AND status='running'").bind(status,Date.now(),slot).run();
  if(finished.meta.changes)await db.prepare("INSERT INTO jobs(id,type,status,detail,created_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),"scheduled-collect",status,JSON.stringify({slot,total,checked,added,errors}),Date.now()).run();
 }
 return {due:true,active:remaining>0,processed:Boolean(claimed),slot,total,checked,added,errors,remaining};
}
