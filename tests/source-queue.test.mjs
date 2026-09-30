import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root=mkdtempSync(join(tmpdir(),'uek-source-queue-'));
try {
 const database=join(root,'radar.sqlite');
 test('migrations preserve scan progress and reject duplicate URLs across restarts',()=>{
  const migrate=()=>spawnSync(process.execPath,['scripts/migrate.mjs'],{env:{...process.env,DATABASE_PATH:database},encoding:'utf8'});
  const first=migrate();assert.equal(first.status,0,first.stderr);
  let db=new DatabaseSync(database);
  db.prepare('INSERT INTO source_scans(source_id,before_id,cutoff_at,active,pages,started_at) VALUES(?,?,?,?,?,?)').run('channel',150,123,1,6,123);
  let insert=db.prepare('INSERT OR IGNORE INTO source_queue(id,source_id,url,title,created_at,updated_at) VALUES(?,?,?,?,?,?)');
  insert.run('one','channel','https://t.me/s/channel/150','A publication title',123,123);
  db.close();
  const second=migrate();assert.equal(second.status,0,second.stderr);
  db=new DatabaseSync(database);
  assert.deepEqual({...db.prepare('SELECT before_id,cutoff_at,active,pages FROM source_scans WHERE source_id=?').get('channel')},{before_id:150,cutoff_at:123,active:1,pages:6});
  insert=db.prepare('INSERT OR IGNORE INTO source_queue(id,source_id,url,title,created_at,updated_at) VALUES(?,?,?,?,?,?)');
  assert.equal(insert.run('two','channel','https://t.me/s/channel/150','Duplicate',124,124).changes,0);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM source_queue').get().count,1);
  db.close();
 });
} finally { process.on('exit',()=>rmSync(root,{recursive:true,force:true})); }
