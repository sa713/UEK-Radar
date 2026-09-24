// The server owns the schedule and the durable progress in SQLite. This small
// worker only calls its internal endpoint, so changing the time needs no deploy.
const base = process.env.WEB_INTERNAL_ORIGIN || 'http://web:3000';
let inFlight = false, attemptedWeek = '', loggedSlot = '';

function moscowClock(now = new Date()) {
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23', weekday: 'short'
 }).formatToParts(now).map(p => [p.type, p.value]));
 return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday, hour: Number(parts.hour) };
}
async function job(mode, timeout = 300000) {
 const response = await fetch(`${base}/api/job?mode=${mode}`, {
  method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  signal: AbortSignal.timeout(timeout)
 });
 if (!response.ok) throw new Error(`${mode} HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
 return response.json();
}
async function tick() {
 if(inFlight) return;
 if(!process.env.CRON_SECRET) { console.error('CRON_SECRET is required'); return; }
 inFlight = true;
 try {
  // Each request processes at most one source. The database records which
  // sources are done, so a restart resumes an unfinished collection.
  for (let i=0; i<1000; i++) {
   const result = await job('scheduled-collect');
   if (!result.active || !result.processed) {
    if(result.active) return;
    if(result.due && result.slot && loggedSlot!==result.slot){
     loggedSlot=result.slot;
     console.log(`Collection ${result.slot}: ${result.status||'done'}, ${result.checked||0} checked, ${result.added||0} new, ${result.errors||0} errors`);
    }
    break;
   }
  }
  const { date, weekday, hour } = moscowClock();
  if(weekday==='Mon' && hour>=8 && attemptedWeek!==date) {
   const result = await job('weekly');
   if(!result.deferred){
    attemptedWeek = date;
    console.log(`Weekly digest completed: ${result.weekId}`);
   }
  }
 } catch(error) { console.error(error); }
 finally { inFlight=false; }
}
void tick();
setInterval(() => { void tick(); }, 60 * 1000);
