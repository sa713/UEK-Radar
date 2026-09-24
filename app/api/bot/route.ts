import { env } from "@/lib/env";
import { getDb } from "@/db";
export async function POST(request:Request){
 if(!env.CRON_SECRET||request.headers.get("x-telegram-bot-api-secret-token")!==env.CRON_SECRET)return new Response("Forbidden",{status:403});
 const data=await request.json() as {message?:{text?:string;from?:{id:number};chat?:{id:number;type:string}}};
 if(data.message?.text?.startsWith("/start")&&data.message.chat?.type==="private"&&data.message.from?.id===data.message.chat.id){
  const id=String(data.message.from.id);await getDb().prepare("UPDATE users SET bot_started=1 WHERE id=?").bind(id).run();
  if(env.TELEGRAM_BOT_TOKEN)await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:id,text:"Подключено. Включите недельную подборку в настройках Радара эксперта УЭК."})});
 }
 return Response.json({ok:true});
}
