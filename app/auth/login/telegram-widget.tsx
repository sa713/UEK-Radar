"use client";
import { useEffect,useRef,useState } from "react";

export function TelegramWidget({username}:{username:string}){
 const slot=useRef<HTMLDivElement>(null),[problem,setProblem]=useState("");
 useEffect(()=>{
  const state=new URLSearchParams(window.location.search).get("state"),container=slot.current;
  if(!state||!container||!username){setProblem("Начните вход с главной страницы.");return}
  const callback=new URL("/auth/telegram",window.location.origin);callback.searchParams.set("state",state);
  const script=document.createElement("script");script.async=true;script.src="https://telegram.org/js/telegram-widget.js?22";
  script.setAttribute("data-telegram-login",username);script.setAttribute("data-size","large");script.setAttribute("data-userpic","false");script.setAttribute("data-auth-url",callback.href);
  script.onerror=()=>setProblem("Не удалось загрузить кнопку Telegram. Обновите страницу или проверьте блокировку скриптов.");
  container.appendChild(script);return()=>{container.replaceChildren()};
 },[username]);
 return <><div ref={slot} className="mt-8 min-h-12"/>{problem&&<p className="mt-4 text-sm text-[#e0c095]">{problem}</p>}</>;
}
