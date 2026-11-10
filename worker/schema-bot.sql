-- R2.4: bot conversation state, audit trail, and the price catalogue table.
-- Spec: docs/superpowers/specs/2026-11-09-invoice-revision-design.md §5, §8
--
-- Every statement is CREATE ... IF NOT EXISTS, so this file is re-runnable
-- (unlike schema-invoice.sql and schema-pricing.sql, which are ALTERs).

-- One conversation per (chat, user). Two admins working in the same group
-- chat must not share a step, so the user is part of the key, not just the
-- chat. A row older than 15 minutes is treated as expired and dropped on
-- the next read (see BOT_STATE_TTL_MS in index.js).
CREATE TABLE IF NOT EXISTS bot_state (
  chat_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  step       TEXT NOT NULL,          -- 'order' | 'edit' | 'confirm' | 'approve'
  order_no   TEXT,
  payload    TEXT,                   -- JSON: the pending quote awaiting a button press
  updated_at TEXT NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);

-- Who changed what, when, and from which Telegram user. Price changes,
-- invoice revisions and approvals all land here; invoice_versions holds the
-- document itself, this holds the decision around it.
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  at           TEXT NOT NULL,
  actor_chat   TEXT,                 -- Telegram chat id the action came from
  actor_user   TEXT,                 -- Telegram user id of the human
  action       TEXT NOT NULL,        -- 'price-set' | 'price-clear' | 'approve' | 'approve-refused'
  order_number TEXT,
  item_key     TEXT,                 -- catalogue key written, if any
  old_value    TEXT,
  new_value    TEXT,
  detail       TEXT                  -- JSON: scope, version, free-form context
);
CREATE INDEX IF NOT EXISTS idx_audit_order ON audit_log(order_number);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);

-- Spec §5.3. R2.4 needs this so "Save price" can remember a price for the
-- next identical order; R3 adds GET /api/prices and /update-price on top.
-- Creating the table here changes no site behaviour on its own.
CREATE TABLE IF NOT EXISTS product_prices (
  item_key   TEXT PRIMARY KEY,       -- 'cake:<spec_key>', 'afang:5L', 'sc-plate-standard'
  category   TEXT NOT NULL,          -- 'soups' | 'rice' | 'finger-foods' | 'catering' | 'cakes'
  label      TEXT NOT NULL,
  price      INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
