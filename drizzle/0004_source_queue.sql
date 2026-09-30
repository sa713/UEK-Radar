CREATE TABLE source_queue (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  source_date INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_id TEXT,
  claimed_at INTEGER,
  error TEXT,
  story_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX source_queue_ready ON source_queue(status,next_attempt_at,created_at);
--> statement-breakpoint
CREATE INDEX source_queue_source ON source_queue(source_id,status);
--> statement-breakpoint
CREATE TABLE source_scans (
  source_id TEXT PRIMARY KEY,
  before_id INTEGER,
  cutoff_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  pages INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL
);
