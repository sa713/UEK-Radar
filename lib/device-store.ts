import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type DeviceUser={id:string;name:string;username:string|null};
export type LoginRow={id:string;verifier_hash:string;display_code:string;status:string;candidate_json:string|null;expires_at:number};
export const hashVerifier=(value:string)=>createHash("sha256").update(value).digest("hex");
export class LoginRateLimit extends Error {}
const validId=(id:string)=>/^[a-f0-9]{32}$/.test(id);
export function createDeviceLogin(db:DatabaseSync,requesterHash:string,now=Date.now()){
 db.prepare("DELETE FROM device_logins WHERE expires_at<?").run(now-86400000);
 const count=db.prepare("SELECT count(*) AS n FROM device_logins WHERE requester_hash=? AND created_at>?").get(requesterHash,now-600000) as {n:number};
 const total=db.prepare("SELECT count(*) AS n FROM device_logins WHERE expires_at>?").get(now) as {n:number};
 if(count.n>=8||total.n>=1000)throw new LoginRateLimit("Слишком много попыток. Попробуйте через 10 минут.");
 const id=randomBytes(16).toString("hex"),verifier=randomBytes(32).toString("hex");
 const code=randomBytes(4).toString("hex").toUpperCase().replace(/(.{4})/,"$1-");
 const expiresAt=now+300000;
 db.prepare("INSERT INTO device_logins(id,verifier_hash,display_code,requester_hash,status,created_at,expires_at) VALUES(?,?,?,?,'pending',?,?)").run(id,hashVerifier(verifier),code,requesterHash,now,expiresAt);
 return {id,verifier,code,expiresAt};
}
export function readDeviceLogin(db:DatabaseSync,id:string,verifier:string,now=Date.now()):LoginRow|null{
 if(!validId(id)||!/^[a-f0-9]{64}$/.test(verifier))return null;
 const row=db.prepare("SELECT * FROM device_logins WHERE id=? AND expires_at>?").get(id,now) as LoginRow|undefined;
 if(!row||!timingSafeEqual(Buffer.from(row.verifier_hash,"hex"),Buffer.from(hashVerifier(verifier),"hex")))return null;
 return row;
}
export function cancelDeviceLogin(db:DatabaseSync,id:string,verifier:string){
 if(readDeviceLogin(db,id,verifier))db.prepare("UPDATE device_logins SET status='rejected' WHERE id=? AND status IN ('pending','approved')").run(id);
}
export function attachDeviceUser(db:DatabaseSync,id:string,user:DeviceUser,now=Date.now()):string|null{
 if(!validId(id))return null;
 const row=db.prepare("SELECT * FROM device_logins WHERE id=? AND status='pending' AND expires_at>?").get(id,now) as LoginRow|undefined;
 if(!row||(row.candidate_json&&JSON.parse(row.candidate_json).id!==user.id))return null;
 if(!row.candidate_json)db.prepare("UPDATE device_logins SET candidate_json=? WHERE id=? AND status='pending'").run(JSON.stringify(user),id);
 return row.display_code;
}
export function confirmDeviceLogin(db:DatabaseSync,id:string,userId:string,approve:boolean,now=Date.now()):boolean{
 if(!validId(id))return false;
 const row=db.prepare("SELECT * FROM device_logins WHERE id=? AND status='pending' AND expires_at>?").get(id,now) as LoginRow|undefined;
 if(!row?.candidate_json||JSON.parse(row.candidate_json).id!==userId)return false;
 return Number(db.prepare("UPDATE device_logins SET status=? WHERE id=? AND status='pending'").run(approve?"approved":"rejected",id).changes)===1;
}
export function consumeDeviceLogin(db:DatabaseSync,id:string,verifier:string,now=Date.now()):DeviceUser|null{
 const row=readDeviceLogin(db,id,verifier,now);
 if(row?.status!=="approved"||!row.candidate_json)return null;
 if(Number(db.prepare("UPDATE device_logins SET status='consumed' WHERE id=? AND status='approved'").run(id).changes)!==1)return null;
 return JSON.parse(row.candidate_json) as DeviceUser;
}
