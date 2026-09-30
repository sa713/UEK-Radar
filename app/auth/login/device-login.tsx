"use client";
import { useEffect,useState } from "react";
import { LoaderCircle } from "lucide-react";
type Flow={code:string;botUrl:string;expiresAt:number};
export function DeviceLogin(){
 const [flow,setFlow]=useState<Flow|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function start(){
  setBusy(true);setError("");setFlow(null);
  try{
   const response=await fetch("/auth/device/start",{method:"POST"}),data=await response.json();
   if(!response.ok)throw new Error(data.error||"Не удалось начать вход.");
   setFlow(data);
  }catch(e){setError(e instanceof Error?e.message:"Не удалось начать вход.");}finally{setBusy(false);}
 }
 useEffect(()=>{
  if(!flow)return;
  let stopped=false,checking=false;
  async function poll(){
   if(stopped||checking)return;
   if(Date.now()>=flow!.expiresAt){setFlow(null);setError("Срок подтверждения истёк. Начните вход снова.");return;}
   checking=true;
   try{
    const response=await fetch("/auth/device/status",{cache:"no-store"});
    if(!response.ok)return;
    const {status}=await response.json();
    if(stopped)return;
    if(status==="approved"){
     stopped=true;setBusy(true);
     const complete=await fetch("/auth/device/complete",{method:"POST"}),data=await complete.json();
     if(!complete.ok)throw new Error(data.error||"Не удалось завершить вход.");
     window.location.assign("/");
    }else if(["rejected","expired","consumed"].includes(status)){
     stopped=true;setFlow(null);setError(status==="rejected"?"Вход отменён в Telegram.":"Срок подтверждения истёк. Начните вход снова.");
    }
   }catch(e){if(stopped){setError(e instanceof Error?e.message:"Не удалось завершить вход.");setBusy(false);setFlow(null);}}
   finally{checking=false;}
  }
  const timer=setInterval(()=>void poll(),2000);void poll();
  return()=>{stopped=true;clearInterval(timer);};
 },[flow]);
 return <div className="mt-8">
  {!flow?<button onClick={start} disabled={busy} className="flex items-center justify-center gap-3 w-full rounded-xl bg-[#b9f1d4] text-[#0d1720] px-5 py-4 font-semibold disabled:opacity-60">{busy&&<LoaderCircle className="size-5 animate-spin"/>}{busy?"Подготовка входа…":"Начать вход через Telegram"}</button>:<>
   <p className="text-[#a9b9c0]">Код для сверки в Telegram:</p>
   <p className="my-5 text-3xl font-mono tracking-widest text-[#b9f1d4]">{flow.code}</p>
   <a href={flow.botUrl} target="_blank" rel="noopener noreferrer" className="block text-center rounded-xl bg-[#b9f1d4] text-[#0d1720] px-5 py-4 font-semibold">Открыть бота и подтвердить вход ↗</a>
   <p className="mt-4 text-sm leading-6 text-[#a9b9c0]">Нажмите «Старт» у бота, сверьте код и подтвердите вход. Вернитесь в этот браузер — сайт откроется автоматически. Код действует 5 минут.</p>
   <p className="mt-5 flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin"/>{busy?"Завершаем вход…":"Ждём подтверждения в Telegram…"}</p>
  </>}
  {error&&<p role="alert" className="mt-4 text-sm text-[#e0c095]">{error}</p>}
 </div>;
}
