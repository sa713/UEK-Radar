import { env } from "@/lib/env";
import { collect } from "@/lib/sources";
import { prepareWeekly,sendDigest } from "@/lib/weekly";
import { getDb } from "@/db";
import { scheduledCollectionStep,mondayCollectionPending } from "@/lib/schedule";
export async function POST(request:Request){
 if(!env.CRON_SECRET||request.headers.get("Authorization")!==`Bearer ${env.CRON_SECRET}`)return new Response("Forbidden",{status:403});
 try{const url=new URL(request.url),mode=url.searchParams.get("mode");if(mode==="collect")return Response.json({outcomes:await collect(1,url.searchParams.get("source")||undefined)});
  if(mode==="scheduled-collect")return Response.json(await scheduledCollectionStep());
  if(mode==="collect-all")return Response.json({outcomes:await collect(100)});
  if(mode==="bot"){
   if(!env.TELEGRAM_BOT_TOKEN||!env.SITE_ORIGIN)throw new Error("Бот Telegram не настроен");
   const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:`${env.SITE_ORIGIN}/api/bot`,secret_token:env.CRON_SECRET,allowed_updates:["message"]})});
   if(!response.ok)throw new Error(`Telegram API: ${response.status}`);
   return Response.json({ok:true});
  }
  if(mode==="weekly"){
   if(await mondayCollectionPending())return Response.json({deferred:true,reason:"Ожидаем завершения понедельничного сбора"});
   const week=await prepareWeekly() as {id:string;status:string};
   if(week.status==="draft")await getDb().prepare("UPDATE weekly SET status='published' WHERE id=? AND status='draft'").bind(week.id).run();
   return Response.json({weekId:week.id,results:await sendDigest(week.id)});
  }
  if(mode==="deliver"){const weekId=new URL(request.url).searchParams.get("id")||"";return Response.json({results:await sendDigest(weekId)});}
  return Response.json({error:"Unknown mode"},{status:400});
 }catch(e){console.error("Job failed",e);return Response.json({error:e instanceof Error?e.message:"Job failed"},{status:500})}
}
