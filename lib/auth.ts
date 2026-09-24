import { env } from "@/lib/env";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { isAdminUsername } from "@/lib/admin";

const enc = new TextEncoder();
function base64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
function decode(s: string) { return Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")), c=>c.charCodeAt(0)); }
export function randomKey() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
async function hmac(secret: string, message: string) {
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(message))));
}
export async function sign(data: object) {
  if(!env.SESSION_SECRET) throw new Error("SESSION_SECRET not configured");
  const body=base64url(enc.encode(JSON.stringify(data)));
  return `${body}.${await hmac(env.SESSION_SECRET,body)}`;
}
export async function verify(value?: string): Promise<Record<string, unknown>|null> {
  if(!value||!env.SESSION_SECRET) return null;
  const [body,mac]=value.split("."); if(!body||!mac||!/^[A-Za-z0-9_-]{43}$/.test(mac)) return null;
  const key=await crypto.subtle.importKey("raw",enc.encode(env.SESSION_SECRET),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("HMAC",key,decode(mac),enc.encode(body)))return null;
  try { const data=JSON.parse(new TextDecoder().decode(decode(body))); if(typeof data.exp!=="number"||data.exp<Date.now()/1000) return null; return data; } catch { return null; }
}
export async function getIdentity() {
  const value=(await cookies()).get("uek_session")?.value;
  const session=await verify(value);
  const id=session?.id;
  if(typeof id!=="string"||!/^\d{1,20}$/.test(id)) return null;
  const username=typeof session?.username==="string"?session.username:null;
  const issuedAt=session?.iat;
  const admin=isAdminUsername(username,env.ADMIN_TELEGRAM_USERNAME)&&typeof issuedAt==="number"&&issuedAt<=Date.now()/1000&&Date.now()/1000-issuedAt<12*3600;
  return {id,name:typeof session?.name==="string"?session.name:"Читатель",username,role:admin?"admin":"reader" as "admin"|"reader"};
}
export async function requireIdentity(admin=false) {
  const identity=await getIdentity();
  if(!identity) throw new Response("Требуется вход через Telegram",{status:401});
  if(admin&&identity.role!=="admin") throw new Response("Недостаточно прав",{status:403});
  return identity;
}
export async function ensureUser(identity:{id:string,name:string,role:string,username?:string|null}) {
  const db=getDb();
  await db.prepare("INSERT INTO users (id,name,username,role,created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=COALESCE(excluded.username,users.username),role=excluded.role")
    .bind(identity.id,identity.name,identity.username||null,identity.role,Date.now()).run();
}
export async function verifyTelegramLogin(params:URLSearchParams) {
  if(!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot missing");
  const fields=[...params.entries()].filter(([key])=>key!=="state");
  const names=fields.map(([key])=>key);
  if(fields.length<3||fields.length>10||new Set(names).size!==names.length||names.some(key=>!["id","first_name","last_name","username","photo_url","auth_date","hash"].includes(key)))return null;
  const hash=params.get("hash"),id=params.get("id"),authDate=params.get("auth_date");
  if(!hash||!/^([a-f0-9]{2}){32}$/i.test(hash)||!id||!/^\d{1,20}$/.test(id)||!authDate||!/^\d{10}$/.test(authDate))return null;
  const age=Math.floor(Date.now()/1000)-Number(authDate);
  if(age < -60||age > 600)return null;
  const check=fields.filter(([key])=>key!=="hash").sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>`${key}=${value}`).join("\n");
  const secret=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(env.TELEGRAM_BOT_TOKEN)));
  const key=await crypto.subtle.importKey("raw",secret,{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const signature=Uint8Array.from(hash.match(/.{2}/g)!,byte=>parseInt(byte,16));
  if(!await crypto.subtle.verify("HMAC",key,signature,enc.encode(check)))return null;
  const name=[params.get("first_name"),params.get("last_name")].filter(Boolean).join(" ").trim()||params.get("username")||"Эксперт";
  const username=params.get("username");
  return {id,name:name.slice(0,120),username:username&&/^[A-Za-z0-9_]{5,32}$/.test(username)?username:null};
}
export const cookieOptions={httpOnly:true,secure:true,sameSite:"lax" as const,path:"/"};
export function authConfigured(){return Boolean(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_BOT_USERNAME&&env.SESSION_SECRET);}
