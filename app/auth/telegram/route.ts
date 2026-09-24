import { env } from "@/lib/env";
import { NextResponse } from "next/server";
import { verify,sign,verifyTelegramLogin,cookieOptions,ensureUser } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin";

export async function GET(request:Request){
  const url=new URL(request.url);
  const encoded=request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith("uek_login_state="))?.slice("uek_login_state=".length);
  const flow=await verify(encoded?decodeURIComponent(encoded):undefined);
  if(!flow||flow.state!==url.searchParams.get("state"))return new Response("Сеанс входа истёк. Попробуйте ещё раз.",{status:400});
  try {
    const user=await verifyTelegramLogin(url.searchParams);
    if(!user)return new Response("Telegram не подтвердил вход. Попробуйте ещё раз.",{status:401});
    const admin=isAdminUsername(user.username,env.ADMIN_TELEGRAM_USERNAME);
    await ensureUser({...user,role:admin?"admin":"reader"});
    const response=NextResponse.redirect(new URL("/",env.SITE_ORIGIN||url.origin));
    // Username is mutable on Telegram; ask editors to sign in again every 12h.
    const maxAge=admin?12*3600:30*86400;
    const issuedAt=Math.floor(Date.now()/1000);
    response.cookies.set("uek_session",await sign({...user,iat:issuedAt,exp:issuedAt+maxAge}),{...cookieOptions,maxAge});
    response.cookies.delete("uek_login_state");
    return response;
  } catch(e){console.error("Telegram authorization failed",e);return new Response("Не удалось проверить вход через Telegram",{status:502});}
}
