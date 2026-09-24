import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve(process.env.DATABASE_PATH || './data/radar.sqlite');
const destination = resolve(process.argv[2] || `./backups/radar-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(source, { readOnly: true });
try { await backup(db, destination); chmodSync(destination, 0o600); console.log(destination); }
finally { db.close(); }
