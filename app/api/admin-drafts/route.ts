import { requireIdentity } from "@/lib/auth";
import { getDb } from "@/db";
export async function GET(){
 try{await requireIdentity(true);const rows=await getDb().prepare("SELECT * FROM stories WHERE state IN ('draft','hidden') ORDER BY discovered_at DESC LIMIT 100").all();return Response.json({stories:rows.results})}catch(e){return e instanceof Response?e:Response.json({error:"Список недоступен"},{status:500})}
}
