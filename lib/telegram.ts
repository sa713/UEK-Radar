import { env } from "@/lib/env";
export class TelegramApiError extends Error {constructor(public status:number){super(`Telegram API HTTP ${status}`);}}
export async function telegramCall(method:string,payload:Record<string,unknown>){
 if(!env.TELEGRAM_BOT_TOKEN)throw new Error("Telegram bot missing");
 let response:Response;
 try{response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});}catch{throw new Error("Telegram API unavailable");}
 if(!response.ok)throw new TelegramApiError(response.status);
 const result=await response.json();
 if(!result.ok)throw new Error("Telegram API rejected request");
 return result.result;
}
export async function configureTelegramBot(){
 if(env.TELEGRAM_LOGIN_MODE==="device"){
  await telegramCall("deleteWebhook",{drop_pending_updates:false});
  return "Бот переключён на получение сообщений сервером. Проверьте, что worker запущен.";
 }
 if(!env.SITE_ORIGIN||!env.CRON_SECRET)throw new Error("Bot configuration is incomplete");
 await telegramCall("setWebhook",{url:`${env.SITE_ORIGIN}/api/bot`,secret_token:env.CRON_SECRET,allowed_updates:["message"]});
 return "Бот подключён";
}
