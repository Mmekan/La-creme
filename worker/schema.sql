CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  received_at TEXT NOT NULL,
  order_type TEXT,
  name TEXT,
  phone TEXT,
  delivery TEXT,
  address TEXT,
  date_needed TEXT,
  event_type TEXT,
  guests TEXT,
  service_type TEXT,
  items TEXT,
  total TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'New'
);
CREATE INDEX IF NOT EXISTS idx_orders_received ON orders(received_at DESC);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts(ip, ts);
