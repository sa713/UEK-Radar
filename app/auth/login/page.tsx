import { env } from "@/lib/env";
import Link from "next/link";
import { TelegramWidget } from "./telegram-widget";

export const dynamic="force-dynamic";
export default function Login(){
 const username=env.TELEGRAM_BOT_USERNAME||"";
 return <main className="min-h-screen grid place-items-center px-5"><div className="max-w-lg w-full rounded-[28px] border border-[#344655] bg-[#14202d] p-8 sm:p-12"><span className="text-sm tracking-[.2em] uppercase text-[#b9f1d4]">УЭК / Радар</span><h1 className="mt-10 text-3xl font-semibold">Вход через Telegram</h1><p className="mt-4 text-[#a9b9c0] leading-7">Войдите через @{username}, чтобы открыть ленту и настроить подборку.</p><TelegramWidget username={username}/><Link className="mt-8 inline-block text-sm text-[#b9f1d4] underline" href="/">На главную</Link></div></main>;
}
