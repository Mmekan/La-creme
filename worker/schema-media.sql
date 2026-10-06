-- Media upload pipeline (docs/superpowers/specs/2026-10-05-media-upload-pipeline-design.md).
-- Applied on top of schema.sql, which owns the orders tables.
--
-- Statuses on upload_items:
--   Pending   — durably in R2, awaiting your approval
--   Approved  — returned by GET /api/gallery, live in the gallery
--   Rejected  — hidden from the manifest; R2 object retained on purpose
--   Failed    — R2 write or read-back did not confirm; safe to retry

CREATE TABLE IF NOT EXISTS upload_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Generated once per upload session by upload.js and sent with every
  -- file in that session, so files can be grouped into one dashboard
  -- row and one Telegram message instead of N of each.
  client_batch_id TEXT NOT NULL UNIQUE,
  received_at TEXT NOT NULL,
  category TEXT NOT NULL,
  -- file_count: how many photos the client SAID it would send (declared
  -- on the first file). stored_count/failed_count: what actually
  -- happened. A batch is finished when stored_count + failed_count
  -- reaches file_count.
  file_count INTEGER NOT NULL DEFAULT 0,
  stored_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  -- 0 = no failure Telegram sent for this batch yet, 1 = already sent.
  -- Keeps a 23-file batch from buzzing the phone once per failure.
  failure_notified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending'
);
CREATE INDEX IF NOT EXISTS idx_batches_received ON upload_batches(received_at DESC);

CREATE TABLE IF NOT EXISTS upload_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES upload_batches(id),
  filename TEXT,
  r2_key TEXT NOT NULL,
  image_url TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'Pending',
  error TEXT,
  received_at TEXT NOT NULL,
  approved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_batch ON upload_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON upload_items(status);

-- Rate limiting for the unauthenticated POST /api/upload (spec 6.4).
-- Time-windowed rows keyed by IP, mirroring login_attempts in schema.sql.
-- Old rows are pruned on each write.
CREATE TABLE IF NOT EXISTS upload_rate (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_ip ON upload_rate(ip, ts);
