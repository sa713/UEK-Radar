CREATE TABLE device_logins (
 id TEXT PRIMARY KEY,
 verifier_hash TEXT NOT NULL,
 display_code TEXT NOT NULL,
 requester_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','consumed')),
 candidate_json TEXT,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX device_logins_requester ON device_logins(requester_hash,created_at);
--> statement-breakpoint
CREATE TABLE bot_poll_state (id INTEGER PRIMARY KEY CHECK(id=1), next_offset INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
INSERT INTO bot_poll_state(id,next_offset) VALUES(1,0);
