-- INV-1: structured line items + revision marker.
-- Spec: docs/superpowers/specs/2026-11-06-invoice-workflow-design.md §4.1
--
-- SQLite has no "ADD COLUMN IF NOT EXISTS", so re-running this file errors
-- with "duplicate column name". That error is the expected, safe outcome —
-- it means the column is already there. schema.sql / schema-media.sql are
-- CREATE ... IF NOT EXISTS and stay re-runnable; this one cannot be.
ALTER TABLE orders ADD COLUMN lines_json TEXT;
ALTER TABLE orders ADD COLUMN revised INTEGER NOT NULL DEFAULT 0;
