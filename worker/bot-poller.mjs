const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function runBotPoller(){
 if(process.env.TELEGRAM_LOGIN_MODE!=='device')return;
 const token=process.env.TELEGRAM_BOT_TOKEN,secret=process.env.CRON_SECRET;
 if(!token||!secret){console.error('Bot polling configuration missing');return;}
 const base=process.env.WEB_INTERNAL_ORIGIN||'http://web:3000';
 const headers={'x-telegram-bot-api-secret-token':secret};
 let offset=null,ready=false,warned=false;
 async function api(method,body){
  const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(35000)});
  const data=await response.json();
  if(!response.ok||!data.ok)throw new Error('Telegram API unavailable');
  return data.result;
 }
 while(true){
  try{
   if(!ready){
    const info=await api('getWebhookInfo',{});
    if(info.url){
     if(!warned){console.error('Telegram webhook is still active. Run scripts/setup-bot.mjs manually to enable bot login.');warned=true;}
     await sleep(15000);continue;
    }
    ready=true;warned=false;
   }
   if(offset===null){
    const response=await fetch(`${base}/api/bot`,{headers,signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Bot state unavailable');
    offset=(await response.json()).offset;
    if(!Number.isSafeInteger(offset)||offset<0)throw new Error('Invalid bot offset');
   }
   const updates=await api('getUpdates',{offset,timeout:25,limit:30,allowed_updates:['message','callback_query']});
   for(const update of updates){
    const response=await fetch(`${base}/api/bot`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(update),signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw new Error('Bot processing unavailable');
    offset=Math.max(offset,(await response.json()).offset);
   }
  }catch{
   // Fetch errors can contain the bot token; log only a generic message.
   console.error('Bot polling paused; retrying in 10 seconds.');
   ready=false;offset=null;await sleep(10000);
  }
 }
}
