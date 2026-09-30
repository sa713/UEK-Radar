import { env } from "@/lib/env";
export function isSameOrigin(request:Request){
 try{return request.headers.get("origin")===new URL(env.SITE_ORIGIN||request.url).origin;}catch{return false;}
}
