CREATE TABLE IF NOT EXISTS observations (
 minute INTEGER NOT NULL,
 symbol TEXT NOT NULL,
 recorded_at INTEGER NOT NULL,
 status TEXT NOT NULL,
 payload TEXT NOT NULL,
 PRIMARY KEY (minute,symbol)
);
CREATE TABLE IF NOT EXISTS collector_lock (
 id INTEGER PRIMARY KEY CHECK (id=1),
 owner TEXT NOT NULL DEFAULT '',
 expires_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO collector_lock (id) VALUES (1);
