import { env } from "@/lib/env";
import { getDb } from "@/db";
import { attachDeviceUser,confirmDeviceLogin,type DeviceUser } from "@/lib/device-store";
import { telegramCall,TelegramApiError } from "@/lib/telegram";
type Actor={id:number;is_bot?:boolean;first_name?:string;last_name?:string;username?:string};
type Message={message_id?:number;text?:string;from?:Actor;chat?:{id:number;type:string}};
type Update={update_id?:number;message?:Message;callback_query?:{id:string;data?:string;from:Actor;message?:Message}};
function authorized(request:Request){return Boolean(env.CRON_SECRET&&request.headers.get("x-telegram-bot-api-secret-token")===env.CRON_SECRET);}
function deviceUser(actor:Actor):DeviceUser|null{
 if(!Number.isSafeInteger(actor.id)||actor.id<=0||actor.is_bot)return null;
 return {id:String(actor.id),name:[actor.first_name,actor.last_name].filter(Boolean).join(" ").slice(0,120)||"Читатель",username:actor.username&&/^[A-Za-z0-9_]{5,32}$/.test(actor.username)?actor.username:null};
}
export async function GET(request:Request){
 if(!authorized(request))return new Response("Forbidden",{status:403});
 const row=await getDb().prepare("SELECT next_offset FROM bot_poll_state WHERE id=1").first<{next_offset:number}>();
 return Response.json({offset:row?.next_offset||0},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
 if(!authorized(request))return new Response("Forbidden",{status:403});
 let update:Update;try{update=await request.json();}catch{return new Response("Invalid update",{status:400});}
 const id=update.update_id,polling=env.TELEGRAM_LOGIN_MODE==="device";
 if(typeof id!=="number"||!Number.isSafeInteger(id)||id<0)return new Response("Invalid update id",{status:400});
 const offset=await getDb().prepare("SELECT next_offset FROM bot_poll_state WHERE id=1").first<{next_offset:number}>();
 if(polling&&id<(offset?.next_offset||0))return Response.json({ok:true,offset:offset!.next_offset});
 try{
  const message=update.message,callback=update.callback_query;
  if(message?.chat?.type==="private"&&message.from?.id===message.chat.id&&message.text){
   const user=deviceUser(message.from);
   if(user){
    const match=message.text.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+login_([a-f0-9]{32})$/);
    if(polling&&match){
     const code=getDb().transaction(db=>attachDeviceUser(db,match[1],user));
     await telegramCall("sendMessage",{chat_id:user.id,text:code?`Вход в Радар эксперта УЭК\n${env.SITE_ORIGIN}\n\nКод в браузере должен совпадать: ${code}\n\nПодтверждайте только вход, который начали сами. Если получили ссылку от другого человека, нажмите «Отменить».`:"Ссылка входа истекла или уже использована. Начните вход заново на сайте.",...(code?{reply_markup:{inline_keyboard:[[{text:"Подтвердить вход",callback_data:`approve_${match[1]}`},{text:"Отменить",callback_data:`reject_${match[1]}`}]]}}:{})});
    }else if(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(message.text)){
     await getDb().prepare("UPDATE users SET bot_started=1 WHERE id=?").bind(user.id).run();
     await telegramCall("sendMessage",{chat_id:user.id,text:"Бот подключён. Для входа начните авторизацию на сайте Радара. Недельную подборку можно включить в настройках сайта."});
    }
   }
  }else if(polling&&callback?.message?.chat?.type==="private"&&callback.from.id===callback.message.chat.id){
   const match=callback.data?.match(/^(approve|reject)_([a-f0-9]{32})$/),user=deviceUser(callback.from);
   if(match&&user){
    const ok=getDb().transaction(db=>confirmDeviceLogin(db,match[2],user.id,match[1]==="approve"));
    const text=ok?(match[1]==="approve"?"Вход подтверждён. Вернитесь в браузер, где начали вход.":"Вход отменён."):"Запрос истёк или уже обработан. Начните вход заново на сайте.";
    await telegramCall("answerCallbackQuery",{callback_query_id:callback.id,text});
    if(ok&&callback.message.message_id){
     try{await telegramCall("editMessageText",{chat_id:user.id,message_id:callback.message.message_id,text,reply_markup:{inline_keyboard:[]}});}catch{/* Decision is already durable. */}
    }
   }
  }
  if(polling)await getDb().prepare("UPDATE bot_poll_state SET next_offset=max(next_offset,?) WHERE id=1").bind(id+1).run();
  return Response.json({ok:true,offset:polling?id+1:undefined});
 }catch(error){
  if(polling&&error instanceof TelegramApiError&&[400,403].includes(error.status)){
   // Expired callback queries and blocked chats must not block later updates.
   await getDb().prepare("UPDATE bot_poll_state SET next_offset=max(next_offset,?) WHERE id=1").bind(id+1).run();
   return Response.json({ok:true,offset:id+1});
  }
  console.error("Telegram update processing failed");return new Response("Telegram processing unavailable",{status:502});
 }
}
