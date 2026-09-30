import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { env } from "@/lib/env";
import { authConfigured,cookieOptions,ensureUser,sign,verify } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin";
import { cancelDeviceLogin,consumeDeviceLogin,createDeviceLogin,hashVerifier,LoginRateLimit,readDeviceLogin } from "@/lib/device-store";
import { isSameOrigin } from "@/lib/request-origin";

const options={...cookieOptions,sameSite:"strict" as const,path:"/auth/device",maxAge:300};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
async function browserState(){
 const data=await verify((await cookies()).get("uek_device")?.value);
 return typeof data?.id==="string"&&typeof data?.verifier==="string"?{id:data.id,verifier:data.verifier}:null;
}
type Context={params:Promise<{action:string}>};
export async function GET(request:Request,context:Context){
 if(env.TELEGRAM_LOGIN_MODE!=="device")return json({error:"Недоступно"},404);
 if((await context.params).action!=="status")return json({error:"Недоступно"},404);
 const state=await browserState();
 if(!state)return json({status:"expired"});
 const row=getDb().transaction(db=>readDeviceLogin(db,state.id,state.verifier));
 return json({status:row?.status||"expired"});
}
export async function POST(request:Request,context:Context){
 if(env.TELEGRAM_LOGIN_MODE!=="device")return json({error:"Недоступно"},404);
 if(!isSameOrigin(request))return json({error:"Недопустимый источник запроса"},403);
 if(!authConfigured()||!env.SITE_ORIGIN?.startsWith("https://"))return json({error:"Вход ещё не настроен"},503);
 const action=(await context.params).action,state=await browserState();
 try{
  if(action==="start"){
   const requester=request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()||"unknown";
   const flow=getDb().transaction(db=>{
    if(state)cancelDeviceLogin(db,state.id,state.verifier);
    return createDeviceLogin(db,hashVerifier(requester));
   });
   const response=json({code:flow.code,expiresAt:flow.expiresAt,botUrl:`https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=login_${flow.id}`});
   response.cookies.set("uek_device",await sign({id:flow.id,verifier:flow.verifier,exp:Math.floor(flow.expiresAt/1000)}),options);
   return response;
  }
  if(action==="complete"){
   if(!state)return json({error:"Срок входа истёк. Начните снова."},410);
   const user=getDb().transaction(db=>consumeDeviceLogin(db,state.id,state.verifier));
   if(!user)return json({error:"Вход не подтверждён или уже завершён."},409);
   const admin=isAdminUsername(user.username,env.ADMIN_TELEGRAM_USERNAME),maxAge=admin?43200:2592000;
   await ensureUser({...user,role:admin?"admin":"reader"});
   await getDb().prepare("UPDATE users SET bot_started=1 WHERE id=?").bind(user.id).run();
   const iat=Math.floor(Date.now()/1000),response=json({ok:true});
   response.cookies.set("uek_session",await sign({...user,iat,exp:iat+maxAge}),{...cookieOptions,maxAge});
   response.cookies.set("uek_device","",{...options,maxAge:0});
   return response;
  }
  return json({error:"Недоступно"},404);
 }catch(error){
  if(error instanceof LoginRateLimit)return json({error:error.message},429);
  console.error("Device login failed");return json({error:"Не удалось выполнить вход. Начните снова."},500);
 }
}
