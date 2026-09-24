import { env } from "@/lib/env";
import { getIdentity,ensureUser,authConfigured } from "@/lib/auth";
import { ensureSources } from "@/lib/sources";
import { repairSeptemberWeek } from "@/lib/weekly";
import { getCollectionSchedule } from "@/lib/schedule";
import { buildInterestProfile } from "@/lib/relevance";
import { getDb } from "@/db";

export const dynamic="force-dynamic";
export async function GET(request:Request){
 const identity=await getIdentity();
 if(!identity)return Response.json({authenticated:false,loginReady:authConfigured()});
 try{
  await ensureUser(identity); await ensureSources(); await repairSeptemberWeek(); const db=getDb();
  const scope=new URL(request.url).searchParams.get("scope")||"all";
  const filter=scope==="bank"?" AND s.scope='bank'":scope==="world"?" AND s.scope='world'":"";
  const stories=await db.prepare(`SELECT s.*,f.rating,f.saved,f.viewed_at,so.name source_name FROM stories s LEFT JOIN feedback f ON f.story_id=s.id AND f.user_id=? LEFT JOIN sources so ON so.id=s.source_id WHERE s.state='published'${filter} ORDER BY s.important DESC,CASE WHEN s.published_at=s.discovered_at THEN 1 ELSE 0 END,s.published_at DESC,s.discovered_at DESC LIMIT 120`).bind(identity.id).all();
  const user=await db.prepare("SELECT * FROM users WHERE id=?").bind(identity.id).first();
  const rated=await db.prepare("SELECT f.rating,s.topics,s.source_id FROM feedback f JOIN stories s ON s.id=f.story_id WHERE f.user_id=? AND f.rating IN ('useful','uninteresting') ORDER BY COALESCE(f.viewed_at,0) DESC LIMIT 500").bind(identity.id).all<{rating:string;topics:string;source_id:string}>();
  const interestProfile=buildInterestProfile(rated.results);
  const sourceRows=await db.prepare("SELECT id,name,url,kind,group_name,enabled,status,error,last_checked,last_success FROM sources WHERE status!='removed' ORDER BY group_name,name").all();
  const suggestions=await db.prepare(identity.role==="admin"?"SELECT sg.*,u.name proposer FROM suggestions sg LEFT JOIN users u ON u.id=sg.user_id ORDER BY sg.created_at DESC LIMIT 100":"SELECT * FROM suggestions WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(...(identity.role==="admin"?[]:[identity.id])).all();
  const weeks=await db.prepare("SELECT * FROM weekly WHERE status='published' OR ?='admin' ORDER BY created_at DESC LIMIT 24").bind(identity.role).all();
  const uploads=identity.role==="admin"?await db.prepare("SELECT * FROM uploads ORDER BY created_at DESC LIMIT 60").all():{results:[]};
  const jobs=identity.role==="admin"?await db.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 30").all():{results:[]};
  const collectionSchedule=identity.role==="admin"?await getCollectionSchedule():undefined;
  const collectionRun=identity.role==="admin"?await db.prepare("SELECT * FROM collection_runs ORDER BY slot DESC LIMIT 1").first():undefined;
  return Response.json({authenticated:true,user:{...user,role:identity.role},interestProfile,stories:stories.results,sources:sourceRows.results,suggestions:suggestions.results,weeks:weeks.results,uploads:uploads.results,jobs:jobs.results,collectionSchedule,collectionRun,botUsername:env.TELEGRAM_BOT_USERNAME||null,setup:identity.role==="admin"?{openai:Boolean(env.OPENAI_API_KEY),telegram:authConfigured(),bot:Boolean(env.TELEGRAM_BOT_TOKEN)}:undefined});
 }catch(e){console.error("state load failed",e);return Response.json({error:"Не удалось загрузить данные. Повторите попытку."},{status:503})}
}
