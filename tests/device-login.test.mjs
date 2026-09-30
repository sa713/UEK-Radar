import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {attachDeviceUser,cancelDeviceLogin,confirmDeviceLogin,consumeDeviceLogin,createDeviceLogin,LoginRateLimit,readDeviceLogin} from '../lib/device-store.ts';
function database(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../drizzle/0003_device_login.sql',import.meta.url),'utf8'));return db;}
const user={id:'12345',name:'Reader',username:'srgld'};
test('only the initiating browser can consume a confirmed login, once',()=>{
 const db=database();try{
  const flow=createDeviceLogin(db,'browser');
  assert.equal(consumeDeviceLogin(db,flow.id,flow.verifier),null);
  assert.equal(attachDeviceUser(db,flow.id,user),flow.code);
  assert.equal(confirmDeviceLogin(db,flow.id,user.id,true),true);
  assert.equal(consumeDeviceLogin(db,flow.id,'0'.repeat(64)),null);
  assert.deepEqual(consumeDeviceLogin(db,flow.id,flow.verifier),user);
  assert.equal(consumeDeviceLogin(db,flow.id,flow.verifier),null);
  assert.equal(confirmDeviceLogin(db,flow.id,user.id,true),false);
 }finally{db.close();}
});
test('another Telegram account cannot replace or approve the attached account',()=>{
 const db=database();try{
  const flow=createDeviceLogin(db,'browser');
  attachDeviceUser(db,flow.id,user);
  assert.equal(attachDeviceUser(db,flow.id,{...user,id:'67890'}),null);
  assert.equal(confirmDeviceLogin(db,flow.id,'67890',true),false);
  assert.equal(readDeviceLogin(db,flow.id,flow.verifier).status,'pending');
 }finally{db.close();}
});
test('expired, rejected and restarted requests cannot issue a session',()=>{
 const db=database();try{
  const flow=createDeviceLogin(db,'browser',1000);
  assert.equal(attachDeviceUser(db,flow.id,user,301000),null);
  const rejected=createDeviceLogin(db,'browser');attachDeviceUser(db,rejected.id,user);
  confirmDeviceLogin(db,rejected.id,user.id,false);
  assert.equal(confirmDeviceLogin(db,rejected.id,user.id,true),false);
  assert.equal(consumeDeviceLogin(db,rejected.id,rejected.verifier),null);
  const cancelled=createDeviceLogin(db,'browser');attachDeviceUser(db,cancelled.id,user);
  confirmDeviceLogin(db,cancelled.id,user.id,true);cancelDeviceLogin(db,cancelled.id,cancelled.verifier);
  assert.equal(consumeDeviceLogin(db,cancelled.id,cancelled.verifier),null);
 }finally{db.close();}
});
test('repeated attempts are bounded and the limit expires',()=>{
 const db=database();try{
  for(let i=0;i<8;i++)createDeviceLogin(db,'browser',1000);
  assert.throws(()=>createDeviceLogin(db,'browser',1001),LoginRateLimit);
  assert.doesNotThrow(()=>createDeviceLogin(db,'browser',602000));
 }finally{db.close();}
});
