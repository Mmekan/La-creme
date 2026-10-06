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

/* ---------- media upload pipeline ----------
   Spec: docs/superpowers/specs/2026-10-05-media-upload-pipeline-design.md
------------------------------------------------ */

// Mirror of MEDIA_CATEGORIES in config.js. The Worker cannot import
// config.js — that file calls document.getElementById at load, which
// throws outside a browser. Keep the two lists identical; Task 1's
// config.js carries the matching cross-reference comment, and Step 4
// below verifies the server rejects a category the client doesn't offer.
const MEDIA_CATEGORIES = [
  'Traditional Wedding Cakes',
  'Anniversary',
  'Cakes for Boys',
  'Cakes for Girls',
  'Cakes for Men',
  'Cakes for Women',
  'Wedding Cakes',
  'Catering & Events',
  'Small Chops',
];

const R2_BASE_URL = 'https://pub-a9f72716b1e94d4bb55753e389d9903d.r2.dev';
const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;            // spec 6.4 body cap
const UPLOAD_MAX_BATCH = 200;                        // spec 6.4 batch cap
const RATE_WINDOW_MS = 60 * 60 * 1000;               // 1 hour
const RATE_MAX_PER_WINDOW = 30;                      // spec 6.4: 30 files/hour
const RATE_DAY_MS = 24 * 60 * 60 * 1000;
const RATE_MAX_HOURS_PER_DAY = 20;                   // spec 6.4: 20 distinct hours/day

// 'Catering & Events' -> 'catering-and-events'. Keys are our own, so
// anything non-slug-safe just gets dropped rather than escaped.
function slugifyCategory(cat) {
  return String(cat).toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Returns true if this IP has exhausted its allowance. Inserts a
// timestamped row when allowed, so the *next* call sees it.
async function uploadRateLimited(ip, env) {
  const now = Date.now();
  await env.DB.prepare('DELETE FROM upload_rate WHERE ts < ?').bind(now - RATE_DAY_MS).run();

  const hour = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM upload_rate WHERE ip = ? AND ts > ?'
  ).bind(ip, now - RATE_WINDOW_MS).all();
  if (hour.results[0].n >= RATE_MAX_PER_WINDOW) return true;

  // ts / 3600000 is integer division in SQLite, so this counts distinct
  // hour-buckets rather than hours — matches "20 distinct hours per day".
  const day = await env.DB.prepare(
    'SELECT COUNT(DISTINCT (ts / 3600000)) AS n FROM upload_rate WHERE ip = ? AND ts > ?'
  ).bind(ip, now - RATE_DAY_MS).all();
  if (day.results[0].n >= RATE_MAX_HOURS_PER_DAY) return true;

  await env.DB.prepare('INSERT INTO upload_rate (ip, ts) VALUES (?, ?)').bind(ip, now).run();
  return false;
}

// Creates the batch row on the file's first arrival, otherwise returns
// the existing one. Separate from the insert so handleUpload stays flat.
async function ensureBatch(env, clientBatchId, category, declaredTotal, nowIso) {
  const existing = await env.DB.prepare(
    'SELECT * FROM upload_batches WHERE client_batch_id = ?'
  ).bind(clientBatchId).first();
  if (existing) return existing;

  await env.DB.prepare(
    `INSERT INTO upload_batches
       (client_batch_id, received_at, category, file_count, status)
     VALUES (?, ?, ?, ?, 'Pending')`
  ).bind(clientBatchId, nowIso, category, declaredTotal).run();
  return await env.DB.prepare(
    'SELECT * FROM upload_batches WHERE client_batch_id = ?'
  ).bind(clientBatchId).first();
}

// Folds one file's outcome into its batch. Every expression in the SET
// clause reads the row's pre-update values, which is what makes the
// status CASE work: failed_count inside the CASE is the count *before*
// this file, so `failed_count + <failedDelta> > 0` correctly catches the
// case where this very file is the first failure.
async function bumpBatch(env, batch, storedDelta, failedDelta, bytes) {
  await env.DB.prepare(
    `UPDATE upload_batches
        SET stored_count = stored_count + ?,
            failed_count = failed_count + ?,
            total_bytes  = total_bytes + ?,
            status = CASE
              WHEN stored_count + failed_count + ? + ? >= file_count THEN
                CASE WHEN failed_count + ? > 0 THEN 'Partial' ELSE 'Complete' END
              ELSE 'Pending'
            END
      WHERE id = ?`
  ).bind(storedDelta, failedDelta, bytes, storedDelta, failedDelta, failedDelta, batch.id).run();
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });

// Same as json(), but cacheable. Only GET /api/gallery uses it — the
// manifest changes only when you approve or reject something, so a
// minute of edge caching is safe and spares a D1 read per gallery view.
const jsonCached = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...cors },
  });

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

async function handleUpload(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  // Cheapest rejection first — never parse a body we're going to refuse.
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > UPLOAD_MAX_BYTES) return json({ error: 'That photo is too large.' }, 413);
  if (await uploadRateLimited(ip, env)) {
    return json({ error: 'Too many uploads right now — try again later.' }, 429);
  }

  let form;
  try { form = await request.formData(); } catch (e) { return json({ error: 'Bad request' }, 400); }

  const file = form.get('file');
  const category = String(form.get('category') || '');
  const clientBatchId = String(form.get('clientBatchId') || '').trim();
  const declaredTotal = Number(form.get('batchTotal')) || 1;
  const filename = clip(form.get('filename') || (file && file.name) || 'photo', 200);

  if (!file || typeof file === 'string') return json({ error: 'No photo received.' }, 400);
  if (!MEDIA_CATEGORIES.includes(category)) return json({ error: 'Unknown category.' }, 400);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientBatchId)) return json({ error: 'Bad batch id.' }, 400);
  if (declaredTotal < 1 || declaredTotal > UPLOAD_MAX_BATCH) {
    return json({ error: 'Too many photos in one upload.' }, 429);
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: 'That file is empty.' }, 400);
  if (bytes.byteLength > UPLOAD_MAX_BYTES) return json({ error: 'That photo is too large.' }, 413);

  const nowIso = new Date().toISOString();
  const batch = await ensureBatch(env, clientBatchId, category, declaredTotal, nowIso);
  if (batch.category !== category) return json({ error: 'One upload must stay in one category.' }, 400);
  if (batch.stored_count + batch.failed_count >= UPLOAD_MAX_BATCH) {
    return json({ error: 'Too many photos in one upload.' }, 429);
  }

  const width = Math.max(0, Math.min(20000, Number(form.get('clientWidth')) || 0));
  const height = Math.max(0, Math.min(20000, Number(form.get('clientHeight')) || 0));
  const key = `img/${slugifyCategory(category)}/${crypto.randomUUID()}.jpg`;

  let imageUrl = '', failure = null;
  try {
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    const head = await env.MEDIA.head(key);
    if (!head || head.size !== bytes.byteLength) throw new Error('read-back size mismatch');
    imageUrl = `${R2_BASE_URL}/${key}`;
  } catch (err) {
    failure = err && err.message ? err.message : String(err);
  }

  if (failure) {
    // Record the failure rather than 500-ing: the client will retry the
    // whole file, and if it also fails we still have a row to show.
    await env.DB.prepare(
      `INSERT INTO upload_items
         (batch_id, filename, r2_key, image_url, bytes, width, height, status, error, received_at)
       VALUES (?, ?, ?, '', ?, ?, ?, 'Failed', ?, ?)`
    ).bind(batch.id, filename, key, bytes.byteLength, width, height, clip(failure, 300), nowIso).run();
    await bumpBatch(env, batch, 0, 1, 0);
    return json({ error: 'We could not store that photo. Please try again.' }, 502);
  }

  await env.DB.prepare(
    `INSERT INTO upload_items
       (batch_id, filename, r2_key, image_url, bytes, width, height, status, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`
  ).bind(batch.id, filename, key, imageUrl, bytes.byteLength, width, height, nowIso).run();
  await bumpBatch(env, batch, 1, 0, bytes.byteLength);

  return json({ id: key, r2Key: key, imageUrl }, 201);
}

async function handleGallery(env) {
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.image_url, i.width, i.height, b.category
       FROM upload_items i
       JOIN upload_batches b ON b.id = i.batch_id
      WHERE i.status = 'Approved'
      ORDER BY i.approved_at DESC, i.id DESC
      LIMIT 500`
  ).all();

  // Shape matches GALLERY_ITEMS so gallery.js can append these straight
  // onto the hardcoded array. id is namespaced 'u<rowid>' so it can never
  // collide with the numeric ids in gallery-data.js (spec 9).
  return jsonCached(results.map(r => ({
    id: 'u' + r.id,
    category: r.category,
    image: r.image_url,
    aspect: (r.width > 0 && r.height > 0) ? Number((r.width / r.height).toFixed(4)) : 0.75,
    iconKey: 'cake',
    caption: '',
    sub: '',
  })));
}

async function handleListUploads(env) {
  const { results } = await env.DB.prepare(
    `SELECT b.id, b.received_at, b.category, b.file_count, b.stored_count,
            b.failed_count, b.total_bytes, b.status,
            COALESCE(SUM(CASE WHEN i.status = 'Approved' THEN 1 ELSE 0 END), 0) AS approved,
            COALESCE(SUM(CASE WHEN i.status = 'Pending'  THEN 1 ELSE 0 END), 0) AS pending,
            COALESCE(SUM(CASE WHEN i.status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejected,
            COALESCE(SUM(CASE WHEN i.status = 'Failed'   THEN 1 ELSE 0 END), 0) AS failed
       FROM upload_batches b
       LEFT JOIN upload_items i ON i.batch_id = b.id
      GROUP BY b.id
      ORDER BY b.received_at DESC
      LIMIT 100`
  ).all();
  return json({ batches: results });
}

async function handleGetUpload(env, id) {
  const batch = await env.DB.prepare(
    'SELECT * FROM upload_batches WHERE id = ?'
  ).bind(id).first();
  if (!batch) return json({ error: 'Not found' }, 404);
  const { results } = await env.DB.prepare(
    'SELECT * FROM upload_items WHERE batch_id = ? ORDER BY id'
  ).bind(id).all();
  return json({ batch, items: results });
}

async function handleUpdateUpload(request, env, id) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
  const status = String(body.status || '');
  // 'Pending' is accepted as well as the two spec 6.3 statuses so a
  // mis-click is genuinely reversible: spec 6.3 says a rejected item's
  // R2 object is "retained … so a mis-click is recoverable", and without
  // a way back to Pending that claim would be false — Approve would be
  // the only escape and it would publish without review.
  if (status !== 'Approved' && status !== 'Rejected' && status !== 'Pending') {
    return json({ error: 'Bad status' }, 400);
  }

  const item = await env.DB.prepare(
    'SELECT * FROM upload_items WHERE id = ?'
  ).bind(id).first();
  if (!item) return json({ error: 'Not found' }, 404);
  if (item.status === 'Failed') {
    return json({ error: 'This photo never reached storage — re-send it from the upload page.' }, 409);
  }

  await env.DB.prepare(
    'UPDATE upload_items SET status = ?, approved_at = ? WHERE id = ?'
  ).bind(status, status === 'Approved' ? new Date().toISOString() : null, id).run();
  return json({ ok: true, status });
}

async function handleRetryUpload(env, id) {
  const item = await env.DB.prepare(
    'SELECT * FROM upload_items WHERE id = ?'
  ).bind(id).first();
  if (!item) return json({ error: 'Not found' }, 404);
  if (item.status !== 'Failed') return json({ error: 'Only failed photos can be retried.' }, 400);

  // The bytes are never retained server-side, so retry can only recover a
  // case where the R2 write landed but we failed to confirm it. If the
  // object genuinely is not there, say so plainly — the owner re-sends
  // from her phone, which is what spec 8's failure message tells her.
  const head = await env.MEDIA.head(item.r2_key);
  if (head && head.size === item.bytes) {
    await env.DB.prepare(
      `UPDATE upload_items
          SET status = 'Pending', error = NULL, image_url = ?
        WHERE id = ?`
    ).bind(`${R2_BASE_URL}/${item.r2_key}`, id).run();
    return json({ ok: true, recovered: true });
  }
  return json({ error: 'The photo never reached storage — re-send it from the upload page.' }, 409);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/orders' && request.method === 'POST') return await handleCreateOrder(request, env);
      if (url.pathname === '/api/login' && request.method === 'POST') return await handleLogin(request, env);
      if (url.pathname === '/api/upload' && request.method === 'POST') return await handleUpload(request, env);
      if (url.pathname === '/api/gallery' && request.method === 'GET') return await handleGallery(env);

      if (url.pathname.startsWith('/api/')) {
        if (!(await isAuthed(request, env))) return json({ error: 'Unauthorized' }, 401);
        if (url.pathname === '/api/orders' && request.method === 'GET') return await handleListOrders(url, env);
        const m = url.pathname.match(/^\/api\/orders\/([\w-]+)$/);
        if (m && request.method === 'PATCH') return await handleUpdateOrder(request, env, m[1]);
        if (url.pathname === '/api/uploads' && request.method === 'GET') return await handleListUploads(env);
        // Match /retry before /:id — a bare prefix match would swallow it.
        const mr = url.pathname.match(/^\/api\/uploads\/(\d+)\/retry$/);
        if (mr && request.method === 'POST') return await handleRetryUpload(env, Number(mr[1]));
        const mu = url.pathname.match(/^\/api\/uploads\/(\d+)$/);
        if (mu && request.method === 'GET') return await handleGetUpload(env, Number(mu[1]));
        if (mu && request.method === 'PATCH') return await handleUpdateUpload(request, env, Number(mu[1]));
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'Server error' }, 500);
    }
  },
};
