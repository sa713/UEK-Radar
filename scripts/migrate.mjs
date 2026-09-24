import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const path = resolve(process.env.DATABASE_PATH || './data/radar.sqlite');
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
try {
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000; CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const migrations = readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  for (const name of migrations) {
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(name)) continue;
    const sql = readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8');
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const part of sql.split('--> statement-breakpoint')) if (part.trim()) db.exec(part);
      db.prepare('INSERT INTO schema_migrations(name,applied_at) VALUES(?,?)').run(name, Date.now());
      db.exec('COMMIT');
      console.log(`Applied ${name}`);
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
} finally { db.close(); }
