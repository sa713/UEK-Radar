const { TELEGRAM_BOT_TOKEN: token, SITE_ORIGIN: origin, CRON_SECRET: secret } = process.env;
if(!token||!origin||!secret)throw new Error('Bot configuration is incomplete');
const response=await fetch(`https://api.telegram.org/bot${token}/setWebhook`,{
 method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({url:`${origin}/api/bot`,secret_token:secret,allowed_updates:['message']}),
 signal:AbortSignal.timeout(15000)
});
if(!response.ok)throw new Error(`Telegram API HTTP ${response.status}`);
const result=await response.json();
if(!result.ok)throw new Error('Telegram rejected webhook');
console.log('Telegram webhook configured');
