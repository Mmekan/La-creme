/* ============================================================
   LA CRÈME — ORDER API (Cloudflare Worker + D1)

   Public:   POST /api/orders          the website logs an order here
   Private:  POST /api/login           password -> 12h session token
             GET  /api/orders          list/search orders
             PATCH /api/orders/:no     update an order's status

   Secrets (wrangler secret put): ADMIN_PASSWORD, SESSION_SECRET
============================================================ */

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 30 * 1024;
const MAX_FAILED_LOGINS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const STATUSES = ['New', 'Confirmed', 'In Progress', 'Ready', 'Delivered', 'Cancelled'];
const ORDER_NO_RE = /^\d{8}-\d{9}-[A-Z]{1,3}$/;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });

const clip = (v, max) => String(v == null ? '' : v).slice(0, max);

/* ---------- session tokens: "<expiry>.<hmac>" ---------- */
const enc = new TextEncoder();

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Compares via HMAC so the comparison time doesn't depend on where the
// strings first differ.
async function safeEqual(secret, a, b) {
  return (await hmac(secret, a)) === (await hmac(secret, b));
}

async function makeToken(env) {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return `${exp}.${await hmac(env.SESSION_SECRET, exp)}`;
}

async function isAuthed(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(env.SESSION_SECRET, sig, await hmac(env.SESSION_SECRET, exp));
}

/* ---------- handlers ---------- */
async function handleLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  await env.DB.prepare('DELETE FROM login_attempts WHERE ts < ?').bind(now - LOGIN_WINDOW_MS).run();
  const { results } = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ?').bind(ip).all();
  if (results[0].n >= MAX_FAILED_LOGINS) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
  const ok = await safeEqual(env.SESSION_SECRET, String(body.password || ''), env.ADMIN_PASSWORD);
  if (!ok) {
    await env.DB.prepare('INSERT INTO login_attempts (ip, ts) VALUES (?, ?)').bind(ip, now).run();
    return json({ error: 'Incorrect password' }, 401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
  return json({ token: await makeToken(env), expiresInMs: SESSION_TTL_MS });
}

async function handleCreateOrder(request, env) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Too large' }, 413);
  let o;
  try { o = JSON.parse(raw); } catch (e) { return json({ error: 'Bad request' }, 400); }
  if (!o || !ORDER_NO_RE.test(String(o.orderNumber || ''))) return json({ error: 'Bad order number' }, 400);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO orders
      (order_number, received_at, order_type, name, phone, delivery, address, date_needed,
       event_type, guests, service_type, items, total, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    o.orderNumber, new Date().toISOString(),
    clip(o.orderType, 40), clip(o.name, 120), clip(o.phone, 40), clip(o.delivery, 20),
    clip(o.address, 300), clip(o.dateNeeded, 200), clip(o.eventType, 60), clip(o.guests, 20),
    clip(o.serviceType, 20), clip(o.items, 12000), clip(o.total, 30), clip(o.notes, 1500)
  ).run();
  return json({ ok: true });
}

async function handleListOrders(url, env) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const status = url.searchParams.get('status') || '';
  const type = url.searchParams.get('type') || '';
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 300);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const where = [], args = [];
  if (q) {
    where.push('(order_number LIKE ? OR name LIKE ? OR phone LIKE ? OR items LIKE ?)');
    const like = `%${q.replace(/[%_]/g, '')}%`;
    args.push(like, like, like, like);
  }
  if (STATUSES.includes(status)) { where.push('status = ?'); args.push(status); }
  if (type) { where.push('order_type LIKE ?'); args.push(`%${type.replace(/[%_]/g, '')}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await env.DB.prepare(`SELECT * FROM orders ${clause} ORDER BY received_at DESC LIMIT ? OFFSET ?`)
    .bind(...args, limit, offset).all();
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM orders ${clause}`).bind(...args).all();
  return json({ orders: rows.results, total: count.results[0].n });
}

async function handleUpdateOrder(request, env, orderNumber) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
  if (!STATUSES.includes(body.status)) return json({ error: 'Bad status' }, 400);
  await env.DB.prepare('UPDATE orders SET status = ? WHERE order_number = ?').bind(body.status, orderNumber).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/orders' && request.method === 'POST') return await handleCreateOrder(request, env);
      if (url.pathname === '/api/login' && request.method === 'POST') return await handleLogin(request, env);

      if (url.pathname.startsWith('/api/')) {
        if (!(await isAuthed(request, env))) return json({ error: 'Unauthorized' }, 401);
        if (url.pathname === '/api/orders' && request.method === 'GET') return await handleListOrders(url, env);
        const m = url.pathname.match(/^\/api\/orders\/([\w-]+)$/);
        if (m && request.method === 'PATCH') return await handleUpdateOrder(request, env, m[1]);
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'Server error' }, 500);
    }
  },
};
