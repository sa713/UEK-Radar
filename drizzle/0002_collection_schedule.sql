CREATE TABLE collection_schedule (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL DEFAULT 'daily' CHECK (mode IN ('daily','selected')),
  days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
  time_msk TEXT NOT NULL DEFAULT '05:00',
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO collection_schedule(id,mode,days,time_msk,updated_at) VALUES(1,'daily','[1,2,3,4,5,6,7]','05:00',0);
--> statement-breakpoint
CREATE TABLE collection_runs (
  slot TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  checked INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
--> statement-breakpoint
CREATE TABLE collection_run_sources (
  slot TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER,
  added INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  PRIMARY KEY(slot,source_id)
);
