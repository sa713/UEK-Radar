import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Value = string | number | bigint | Uint8Array | null;
type Row = Record<string, unknown>;
const path = resolve(process.env.DATABASE_PATH || "./data/radar.sqlite");
let connection: DatabaseSync | undefined;

// Keep the small D1 query interface used by the existing application. All SQL
// remains parameterized; synchronous SQLite calls are wrapped in the same API.
export function getDb() {
 if (!connection) {
  mkdirSync(dirname(path), { recursive: true });
  connection = new DatabaseSync(path);
  connection.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000");
 }
 return {
  transaction<T>(fn: (database: DatabaseSync) => T): T {
   connection!.exec("BEGIN IMMEDIATE");
   try { const result=fn(connection!); connection!.exec("COMMIT"); return result; }
   catch(error) { connection!.exec("ROLLBACK"); throw error; }
  },
  prepare(sql: string) {
   const statement = connection!.prepare(sql);
   return {
    bind(...args: Value[]) {
     return {
      async run() { const result = statement.run(...args); return { meta: { changes: result.changes, last_row_id: result.lastInsertRowid } }; },
      async first<T extends Row = Row>(): Promise<T | null> { return (statement.get(...args) as T | undefined) ?? null; },
      async all<T extends Row = Row>(): Promise<{ results: T[] }> { return { results: statement.all(...args) as T[] }; },
     };
    },
    async run() { const result = statement.run(); return { meta: { changes: result.changes, last_row_id: result.lastInsertRowid } }; },
    async first<T extends Row = Row>(): Promise<T | null> { return (statement.get() as T | undefined) ?? null; },
    async all<T extends Row = Row>(): Promise<{ results: T[] }> { return { results: statement.all() as T[] }; },
   };
  },
 };
}
