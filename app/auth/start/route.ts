import { env } from "@/lib/env";
import { NextResponse } from "next/server";
import { randomKey,sign,cookieOptions,authConfigured } from "@/lib/auth";

export async function GET(request:Request){
  if(!authConfigured()) return new Response("Авторизация Telegram ещё не настроена",{status:503});
  const state=randomKey(),origin=env.SITE_ORIGIN||new URL(request.url).origin;
  const url=new URL("/auth/login",origin);url.searchParams.set("state",state);
  const response=NextResponse.redirect(url);
  response.cookies.set("uek_login_state",await sign({state,exp:Math.floor(Date.now()/1000)+600}),{...cookieOptions,maxAge:600});
  return response;
}
