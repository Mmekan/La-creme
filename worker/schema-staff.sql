-- Staff roster and per-order assignment.
--
-- Why D1 and not an env var: the owner adds and removes reps from Telegram,
-- so the list has to be writable by a bot command. TELEGRAM_OWNER_CHAT_IDS
-- stays an env secret on purpose - that is the list that grants the power to
-- edit this one, so it must never be reachable from the bot.
--
-- README of the flow:
--   1. A rep opens the bot and sends /join. The bot replies with their chat
--      id and notifies the owner.
--   2. The owner sends /approve <chat_id> <name>.
--   3. They are on the roster: every order is sent to them, and the rotation
--      starts naming them on the label.
CREATE TABLE IF NOT EXISTS staff (
  chat_id TEXT PRIMARY KEY,   -- Telegram chat id, as a string
  name TEXT NOT NULL,         -- shown on the order label and the invoice
  active INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL,
  added_by TEXT               -- owner chat id that approved them
);

-- Who the rotation picked for this order. Blank on orders that predate the
-- roster, so an old invoice simply omits the line instead of inventing a
-- name. Not re-runnable-safe to ADD twice: SQLite has no IF NOT EXISTS for
-- columns, so a second run errors "duplicate column name" and stops there.
ALTER TABLE orders ADD COLUMN assigned_to TEXT;
