-- R2: pricing state + invoice version history.
-- Spec: docs/superpowers/specs/2026-11-09-invoice-revision-design.md §4
--
-- Existing orders predate price review, so they take the column default
-- 'priced' and never show up as pending — correct, they were all invoiced
-- before this feature existed.
--
-- Like schema-invoice.sql, the ALTERs below are not re-runnable: SQLite has no
-- "ADD COLUMN IF NOT EXISTS", so a second run errors with "duplicate column
-- name". That error is the safe outcome, and it does not stop the
-- CREATE ... IF NOT EXISTS statements that follow it from having already run —
-- wrangler applies the file statement by statement.

-- 'pending' = at least one line arrived with no price and needs a human.
-- 'priced'  = every line has a price; safe to invoice.
-- 'approved'= owner signed off; the PDF must not change without a version bump.
ALTER TABLE orders ADD COLUMN price_status TEXT NOT NULL DEFAULT 'priced';
ALTER TABLE orders ADD COLUMN spec_key TEXT;

-- Small key/value store: bot dedupe window, price-catalogue timestamp, etc.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Immutable snapshots. The live invoice is orders.lines_json; every revision
-- appends here so an approved copy can always be reproduced or compared.
CREATE TABLE IF NOT EXISTS invoice_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  lines_json TEXT NOT NULL,
  total INTEGER NOT NULL,
  reason TEXT,
  actor TEXT,
  UNIQUE(order_number, version)
);
