# Media Upload Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the business owner upload tagged photos from her phone, which land in R2 as *Pending*, get notified via Telegram, and reach the live gallery only after you approve them in `admin.html` — with no code edits, no pasting, no deploy.

**Architecture:** One Cloudflare Worker (`la-creme-orders`) gains four endpoints: a public `POST /api/upload` that writes to R2 then records in D1, a public `GET /api/gallery` manifest, and two Bearer-authenticated admin endpoints for approving/rejecting. `upload.html` is a standalone unlisted page that resizes on-device and uploads one file at a time. `gallery.js` fetches the manifest at load and merges approved items into the existing grid. Nothing is deleted before R2 confirms the write.

**Tech Stack:** Cloudflare Workers (ESM, no framework) · D1 (SQLite) · R2 · Telegram Bot API · vanilla HTML/CSS/JS, `<script defer>`, no build step, no `package.json`.

**Spec:** `docs/superpowers/specs/2026-10-05-media-upload-pipeline-design.md`

## Global Constraints

- **No build step, no bundler, no `package.json`, no npm dependencies.** Files share state via global `const`/`function` in the same scope, loaded by plain `<script defer>` tags in document order. (CLAUDE.md)
- **No automated test suite exists and none is being introduced.** CLAUDE.md: "There are no automated tests. Verify changes manually." Worker endpoints are verified with `curl`; UI is verified with the explicit browser steps given in each task. Treat a failed `curl`/browser step exactly like a failing test — do not proceed to commit.
- **Never hardcode the WhatsApp number, R2 base URL, or naira formatting inline.** Use `CONFIG.whatsappNumber` / `waLink()` / `openWhatsApp()`, `mediaUrl()`, `fmtNaira()`.
- **Any dynamic string interpolated into `innerHTML` must go through `escapeHtml()` first.** Prefer `textContent`.
- **New modals/overlays must use `openModal()` / `closeModal()`** from `config.js`, not a reimplemented focus trap.
- **`admin.js` builds DOM with `el()` + `textContent`, never `innerHTML`** (admin.js:3 documents this as an XSS requirement). The Uploads section must match.
- **`upload.html` must carry `<meta name="robots" content="noindex, nofollow">`** and must never be linked from `index.html` or `gallery.html` (spec §14 — the unlisted URL is the only protection on the unauthenticated upload endpoint).
- **Live Worker URL:** `https://la-creme-orders.lacreme.workers.dev`
- **R2 bucket:** `la-creme-media`, reached from Worker code as `env.MEDIA`. Upload keys are `img/<category-slug>/<id>.jpg`.
- **Wrangler gotcha:** `wrangler r2 object put`/`get` default to a **local miniflare cache**. Always pass `--remote` when probing the live bucket. `wrangler r2 bucket info` is always remote.
- **Categories are duplicated across the client/server boundary by necessity** — `config.js` runs in the browser (and calls `document`), so the Worker cannot import it. Both copies carry a cross-reference comment, and Task 3 Step 4 verifies server-side rejection of an unknown category so drift fails loudly.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `config.js` | Modify | Add `MEDIA_CATEGORIES` + derived `CAKE_FILTER_CATEGORIES`; set `CONFIG.ordersApi`. |
| `gallery-data.js` | Modify | Remove `CAKE_FILTER_CATEGORIES` (now lives in `config.js`). |
| `gallery.js` | Modify | `filterCategories` reads `MEDIA_CATEGORIES`; add manifest merge + count refresh. |
| `worker/schema-media.sql` | Create | `upload_batches`, `upload_items`, `upload_rate` tables. |
| `worker/index.js` | Modify | 4 new endpoints, R2 write/verify, rate limiting, Telegram. |
| `upload.html` | Create | Standalone mobile upload page (inline CSS, noindex). |
| `upload.js` | Create | Dropdown, resize, one-at-a-time upload with progress + retry. |
| `admin.html` | Modify | Tabs (Orders / Uploads) + Uploads panel markup + styles. |
| `admin.js` | Modify | Uploads list, batch detail grid, approve/reject/retry. |

`index.js` needs **no change**: it already reads `CAKE_FILTER_CATEGORIES`, which Task 1 keeps defined (derived from `MEDIA_CATEGORIES`) in `config.js`.

---

### Task 1: Single category source of truth + wire `ordersApi`

**Files:**
- Modify: `config.js:9-20` (the `CONFIG` object) and `config.js:116-117` (`R2_BASE_URL` — anchor only, not edited)
- Modify: `gallery-data.js:27-39` (remove `CAKE_FILTER_CATEGORIES`)
- Modify: `gallery.js:176`

**Interfaces:**
- Consumes: existing `CAKE_FILTER_CATEGORIES` usages at `gallery.js:195`, `index.js:296`, `index.js:339-340`. These **keep working unchanged** because this task redefines `CAKE_FILTER_CATEGORIES` in `config.js` instead of removing it.
- Produces: global `MEDIA_CATEGORIES` — `string[]`, order-sensitive. The gallery filter bar, the cake modal tabs, and (in Task 5) the upload dropdown all render from it in this exact order.
- Produces: `CONFIG.ordersApi` — `string`, the Worker base URL with no trailing slash.

> **Order matters and is deliberate.** `MEDIA_CATEGORIES` must start with `'Traditional Wedding Cakes'` and end with `'Small Chops'`, with `'Wedding Cakes'` seventh. The spec's §4.2 example listed `'Wedding Cakes'` first, which would silently reorder the live filter tabs. The array below reproduces the **current on-screen order exactly**. Do not "tidy" the order.

- [ ] **Step 1: Add `MEDIA_CATEGORIES` and set `ordersApi` in `config.js`**

Replace the whole `const CONFIG = { ... };` block at `config.js:9-20` with:

```js
const CONFIG = {
  // La Crème business WhatsApp number. Digits only, country code
  // first, no + and no leading 0. e.g. 0803 123 4567 -> "2348031234567"
  whatsappNumber: '2348066556677',
  businessName: 'La Crème',

  // Base URL of the order API Worker (see worker/README.md). Orders are
  // logged to it and the admin page (admin.html) reads from it. Leave ''
  // to disable logging (orders still go to WhatsApp).
  ordersApi: 'https://la-creme-orders.lacreme.workers.dev'
};
```

Then immediately **after** the closing `};` of `CONFIG`, insert:

```js
/* ============================================================
   MEDIA CATEGORIES — single source of truth for every gallery
   filter tab, the cake modal's tabs, and the upload page's
   dropdown (upload.js). Order matters: it is the on-screen tab
   order in gallery.html and index.html.

   NOTE FOR THE WORKER: worker/index.js carries its own copy of
   this list (it cannot import config.js — that file calls
   document.getElementById at load). The two must stay in sync.
   Task 3 Step 4 verifies the server rejects an unknown category,
   so drift fails loudly rather than silently.
============================================================ */
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

// Cake-only subset, derived rather than hand-listed so it can never
// drift from MEDIA_CATEGORIES again (that drift is what stranded 23
// 'Cakes'-tagged photos on no tab at all). Consumers: gallery.js's
// 'Cakes' aggregate count and index.js's cake-design modal.
const CAKE_FILTER_CATEGORIES = MEDIA_CATEGORIES.filter(c => c !== 'Catering & Events' && c !== 'Small Chops');
```

- [ ] **Step 2: Remove `CAKE_FILTER_CATEGORIES` from `gallery-data.js`**

Delete lines 27-39 of `gallery-data.js` — the comment block plus the whole `const CAKE_FILTER_CATEGORIES = [ ... ];` array. Leave `const GALLERY_ITEMS = [` in place, immediately preceded by the big header comment.

`gallery-data.js` must not define it any more: `config.js` loads first (script order in `index.html:32-34` and `gallery.html:32-34`), so a second `const` in the same scope would throw `SyntaxError` and blank the page.

- [ ] **Step 3: Repoint `filterCategories` in `gallery.js`**

At `gallery.js:176`, replace:

```js
const filterCategories = ['All', ...CAKE_FILTER_CATEGORIES, 'Catering & Events', 'Small Chops'];
```

with:

```js
const filterCategories = ['All', ...MEDIA_CATEGORIES];
```

- [ ] **Step 4: Verify the gallery is byte-identical in behaviour**

Run a static server and open `gallery.html`:

```bash
npx --yes serve -l 8080 "/c/xampp/htdocs/La creme"
```

Expected — all of these must hold:

1. Console shows **no errors** (a duplicate `const` would show `SyntaxError: Identifier 'CAKE_FILTER_CATEGORIES' has already been declared`).
2. The filter bar reads, in order: `All`, `Traditional Wedding Cakes`, `Anniversary`, `Cakes for Boys`, `Cakes for Girls`, `Cakes for Men`, `Cakes for Women`, `Wedding Cakes`, `Catering & Events`, `Small Chops`.
3. Each tab's count badge matches what it was before this task (compare against `git stash` + reload if unsure).
4. `index.html` → "View Cake Designs" modal still lists the same 7 cake tabs in the same order.
5. Searching `?filter=Cakes` is **not** expected to match any tab (it never did — `'Cakes'` is not a tab); `?filter=Wedding Cakes` must still deep-link correctly.

Also confirm the Worker URL is wired — in `admin.html`'s login form, the error text for a wrong password should be `Incorrect password` (from the API), not `ordersApi is not set in config.js yet.`

- [ ] **Step 5: Commit**

```bash
cd "/c/xampp/htdocs/La creme"
git add config.js gallery-data.js gallery.js
git commit -m "Add MEDIA_CATEGORIES as the single category source of truth

CAKE_FILTER_CATEGORIES is now derived from MEDIA_CATEGORIES in config.js
rather than hand-listed in gallery-data.js. The two lists had already
drifted: 23 items tagged 'Cakes' matched no filter tab and were reachable
only via All. Deriving the cake subset makes that class of bug impossible.

Also sets CONFIG.ordersApi — the Worker was deployed but nothing pointed
at it.

MEDIA_CATEGORIES is ordered to reproduce the current tab order exactly;
the spec's example array would have reordered the live filter bar."
```

---

### Task 2: D1 schema for uploads

**Files:**
- Create: `worker/schema-media.sql`
- Modify: `worker/README.md` (deploy instructions)

**Interfaces:**
- Consumes: existing `worker/schema.sql` conventions (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `AUTOINCREMENT`).
- Produces: tables `upload_batches`, `upload_items`, `upload_rate`. Task 3 reads/writes `upload_rate` and inserts into `upload_batches` + `upload_items`; Task 4 reads all three.

- [ ] **Step 1: Write the schema**

Create `worker/schema-media.sql` with exactly this content:

```sql
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
```

- [ ] **Step 2: Apply it to the remote D1 database**

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler d1 execute la-creme-orders --remote --file=schema-media.sql
```

Expected: `Executing on database la-creme-orders... success` — no errors.

- [ ] **Step 3: Verify the tables exist remotely**

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler d1 execute la-creme-orders --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Expected result set contains all five table names:

```
login_attempts
orders
upload_batches
upload_items
upload_rate
```

(`orders` and `login_attempts` come from the original `schema.sql` and must still be present — this proves you extended rather than replaced.)

- [ ] **Step 4: Document the second schema file in the README**

In `worker/README.md`, immediately after the line reading `npx wrangler d1 execute la-creme-orders --remote --file=schema.sql`, insert:

```
npx wrangler d1 execute la-creme-orders --remote --file=schema-media.sql
```

- [ ] **Step 5: Commit**

```bash
cd "/c/xampp/htdocs/La creme"
git add worker/schema-media.sql worker/README.md
git commit -m "Add D1 schema for the media upload pipeline

upload_batches, upload_items and upload_rate. Rate limiting reuses the
time-windowed login_attempts pattern already in schema.sql.

Applied to the remote database; sqlite_master confirms all five tables
coexist with the original orders/login_attempts tables."
```

---

### Task 3: Worker — `POST /api/upload`

**Files:**
- Modify: `worker/index.js` (add constants + 3 helpers + handler; add one route)

**Interfaces:**
- Consumes: `env.MEDIA` (R2 binding, `wrangler.toml`), tables from Task 2, `json()` and `cors` already in `worker/index.js:19-27`.
- Produces:
  - `POST /api/upload` — multipart, unauthenticated. Fields: `file`, `category`, `clientBatchId`, `batchTotal`, `clientWidth`, `clientHeight`, `filename`. Returns `201 { id, r2Key, imageUrl }`.
  - `MEDIA_CATEGORIES` (Worker copy) — `string[]`.
  - `slugifyCategory(cat: string): string`
  - `R2_BASE_URL` — Worker copy of the bucket URL.

> **Status vocabulary.** Spec §6.2/§6.3 write `approved` lowercase while §7/§7.1 write `Approved`. **Standardizing on the capitalized form** — `Pending`, `Approved`, `Rejected`, `Failed` — to match the existing `orders.status` convention (`'New'`, `'Confirmed'`, …) and `admin.js`'s `STATUSES` array. Everything below uses the capitalized form.

- [ ] **Step 1: Add the media section to `worker/index.js`**

Insert directly **after** `const ORDER_NO_RE = ...` (line 17) and **before** `const cors = {`:

```js
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
```

- [ ] **Step 2: Add the handler**

Insert after `handleUpdateOrder` and **before** `export default {`:

```js
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
```

- [ ] **Step 3: Route it before the auth gate**

In `export default { async fetch(...) }`, inside `try {`, add this line **after** the `/api/login` line and **before** the `if (url.pathname.startsWith('/api/'))` auth block — the auth block would otherwise reject every upload with 401:

```js
      if (url.pathname === '/api/upload' && request.method === 'POST') return await handleUpload(request, env);
```

- [ ] **Step 4: Deploy**

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler deploy
```

Expected: `Uploaded la-creme-orders`, no errors, then prints `https://la-creme-orders.lacreme.workers.dev`.

- [ ] **Step 5: Make a test JPEG**

```bash
cd "/c/xampp/htdocs/La creme"
node -e "require('fs').writeFileSync('/tmp/lc-test.jpg', Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64'))"
ls -la /tmp/lc-test.jpg
```

Expected: a ~630 byte file exists.

- [ ] **Step 6: Write the failing curl tests**

```bash
W="https://la-creme-orders.lacreme.workers.dev"
BID="curltest$(date +%s)"

echo "--- 1. happy path (expect 201) ---"
curl -s -o /tmp/t1 -w "%{http_code}\n" -X POST "$W/api/upload" \
  -F "category=Wedding Cakes" -F "clientBatchId=$BID" -F "batchTotal=1" \
  -F "clientWidth=1" -F "clientHeight=1" -F "filename=probe.jpg" \
  -F "file=@/tmp/lc-test.jpg;type=image/jpeg"
cat /tmp/t1; echo

echo "--- 2. unknown category (expect 400) ---"
curl -s -o /tmp/t2 -w "%{http_code}\n" -X POST "$W/api/upload" \
  -F "category=Cakes" -F "clientBatchId=$BID" -F "batchTotal=1" \
  -F "file=@/tmp/lc-test.jpg;type=image/jpeg"
cat /tmp/t2; echo

echo "--- 3. missing file (expect 400) ---"
curl -s -o /tmp/t3 -w "%{http_code}\n" -X POST "$W/api/upload" \
  -F "category=Wedding Cakes" -F "clientBatchId=$BID" -F "batchTotal=1"
cat /tmp/t3; echo

echo "--- 4. bad batch id (expect 400) ---"
curl -s -o /tmp/t4 -w "%{http_code}\n" -X POST "$W/api/upload" \
  -F "category=Wedding Cakes" -F "clientBatchId=x" -F "batchTotal=1" \
  -F "file=@/tmp/lc-test.jpg;type=image/jpeg"
cat /tmp/t4; echo
```

Expected, in order: `201`, `400`, `400`, `400`, and test 1's body contains a non-empty `imageUrl`.

**Test 2 is the drift guard** — `'Cakes'` exists in `GALLERY_ITEMS` but is deliberately absent from `MEDIA_CATEGORIES`. If the Worker ever accepts it, the two copies have drifted.

- [ ] **Step 7: Verify the bytes actually reached the live bucket**

```bash
cd "/c/xampp/htdocs/La creme/worker"
KEY=$(cd .. && node -e "const fs=require('fs');const t=fs.readFileSync('/tmp/t1','utf8');console.log(JSON.parse(t).r2Key)")
echo "key: $KEY"
npx wrangler r2 object get "la-creme-media/$KEY" --remote --file /tmp/got.jpg
ls -la /tmp/got.jpg
```

Expected: `Download complete.` and a ~630 byte file.

> `--remote` is mandatory. Without it wrangler reads/writes its local miniflare cache and will report success for objects that never reached Cloudflare (see the gotcha in Global Constraints).

- [ ] **Step 8: Verify the D1 rows**

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler d1 execute la-creme-orders --remote --command="SELECT client_batch_id, category, file_count, stored_count, failed_count, status FROM upload_batches ORDER BY id DESC LIMIT 3"
npx wrangler d1 execute la-creme-orders --remote --command="SELECT id, batch_id, filename, status, bytes, width, height FROM upload_items ORDER BY id DESC LIMIT 3"
```

Expected: one batch row with `category = Wedding Cakes`, `file_count = 1`, `stored_count = 1`, `failed_count = 0`, `status = Complete`; one item row with `status = Pending`, `bytes > 0`.

- [ ] **Step 9: Verify the rate limiter**

```bash
W="https://la-creme-orders.lacreme.workers.dev"
for i in $(seq 1 32); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$W/api/upload" \
    -F "category=Wedding Cakes" -F "clientBatchId=ratelimit$(date +%s)" \
    -F "batchTotal=1" -F "file=@/tmp/lc-test.jpg;type=image/jpeg")
  printf "%s " "$code"
done
echo
```

Expected: 30 × `201`, then `429` for the remaining two.

- [ ] **Step 10: Clean up every test artefact**

Test uploads leave real objects in your bucket and rows in D1. Remove them all:

```bash
cd "/c/xampp/htdocs/La creme/worker"

# List every test object under the two categories we probed, delete them.
for PREFIX in "img/wedding-cakes" "img/anniversary" "img/cakes-for-boys" \
              "img/cakes-for-girls" "img/cakes-for-men" "img/cakes-for-women" \
              "img/traditional-wedding-cakes" "img/catering-and-events" "img/small-chops"; do
  npx wrangler r2 object get "la-creme-media/$PREFIX/" --remote 2>/dev/null | grep -o "$PREFIX/[^ ]*jpg" || true
done

# Delete the test rows wholesale (no orders rows are touched — this
# only targets tables created in Task 2).
npx wrangler d1 execute la-creme-orders --remote --command="DELETE FROM upload_items; DELETE FROM upload_batches; DELETE FROM upload_rate;"
```

Because `wrangler r2 object get` cannot list a prefix, delete by key instead — collect the `r2Key` values printed by Step 6's test 1 and by Step 9's responses:

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler d1 execute la-creme-orders --remote --command="SELECT r2_key FROM upload_items" \
  | grep -oE 'img/[a-z0-9-]+/[a-f0-9-]+\.jpg' > /tmp/keys.txt
while read -r k; do
  echo "deleting $k"
  npx wrangler r2 object delete "la-creme-media/$k" --remote
done < /tmp/keys.txt
npx wrangler d1 execute la-creme-orders --remote --command="DELETE FROM upload_items; DELETE FROM upload_batches; DELETE FROM upload_rate;"
rm -f /tmp/keys.txt /tmp/lc-test.jpg /tmp/got.jpg /tmp/t1 /tmp/t2 /tmp/t3 /tmp/t4
```

Expected: `Delete complete.` for each key, then the D1 statement succeeds. Confirm empty:

```bash
npx wrangler r2 bucket info la-creme-media   # object_count back to 334
npx wrangler d1 execute la-creme-orders --remote --command="SELECT COUNT(*) AS n FROM upload_items"
```

Expected: `object_count: 334` (the value before any testing) and `n = 0`.

- [ ] **Step 11: Commit**

```bash
cd "/c/xampp/htdocs/La creme"
git add worker/index.js
git commit -m "Add POST /api/upload to the Worker

Multipart in, rate-limited per IP (30/hour, 20 distinct hours/day),
validated against MEDIA_CATEGORIES, written to R2 then HEAD-verified
before any D1 row is created — so the database never claims a file R2
did not confirm.

Files are grouped by a client-supplied batch id so one upload session
becomes one dashboard row and one Telegram message rather than N of each.

Verified with curl: 201 happy path, 400 on unknown category / missing
file / bad batch id, 429 after 30 uploads. Read-back checked against the
live bucket with --remote, not the local miniflare cache. All test
objects and rows removed afterwards (object_count back to 334)."
```

---

### Task 4: Worker — gallery manifest + admin endpoints

**Files:**
- Modify: `worker/index.js` (add `jsonCached`, 5 handlers, routes)

**Interfaces:**
- Consumes: `env.MEDIA`, `R2_BASE_URL`, `MEDIA_CATEGORIES`, tables from Task 2, `isAuthed()` from `worker/index.js:51`.
- Produces:
  - `GET /api/gallery` — public, **no auth**. Returns `200 { … }` where the body is a JSON **array** of `{ id: 'u<rowid>', category, image, aspect, iconKey, caption, sub }`, header `Cache-Control: public, max-age=60`.
  - `GET /api/uploads` — Bearer. `{ batches: [ { id, received_at, category, file_count, stored_count, failed_count, total_bytes, status, approved, pending, rejected, failed } ] }`
  - `GET /api/uploads/:id` — Bearer. `{ batch, items }`
  - `PATCH /api/uploads/:id` — Bearer. Body `{ status: 'Approved' | 'Rejected' | 'Pending' }`
  - `POST /api/uploads/:id/retry` — Bearer. `{ ok: true, recovered: true }` or `409`

> **Spec deviation, recorded deliberately.** Spec §6.3 lists three admin endpoints and describes `POST /api/uploads/:id/retry` as "re-attempt a failed R2 write". **The original bytes are not kept server-side** — the Worker never stores them, and spec §8's own failure message says *"The file is still on her phone — ask her to retry"*. So there is nothing to re-write. Retry is therefore implemented as **re-verify**: if R2 actually has the object (the write succeeded but the read-back or the client's network failed), flip the row to `Pending`; otherwise return `409` telling you to re-send it. This also adds a fourth admin route, `GET /api/uploads/:id`, because returning items for *every* batch in one response would be up to ~10k rows for 50 batches at the 200-file cap.

> **`caption`/`sub` are hardcoded empty.** Upload does not collect captions (spec §10 lists none), and `makeTile` interpolates both into `innerHTML`. Emitting `''` rather than `undefined` keeps `alt=""` valid and skips the caption block entirely (`gallery.js:291` `makeTile`).

- [ ] **Step 1: Add a cacheable JSON responder**

Insert immediately after the existing `const json = ...` (line 26):

```js
// Same as json(), but cacheable. Only GET /api/gallery uses it — the
// manifest changes only when you approve or reject something, so a
// minute of edge caching is safe and spares a D1 read per gallery view.
const jsonCached = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...cors },
  });
```

- [ ] **Step 2: Add the five handlers**

Insert after `handleUpload` and **before** `export default {`:

```js
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
```

- [ ] **Step 3: Route it**

Two edits inside `export default { async fetch(...) }`:

**(a)** Add the public route — immediately after the `/api/upload` line from Task 3 Step 3, still **before** the `startsWith('/api/')` auth block:

```js
      if (url.pathname === '/api/gallery' && request.method === 'GET') return await handleGallery(env);
```

**(b)** Add the admin routes — inside the existing `if (url.pathname.startsWith('/api/')) { ... }` block, after the `/api/orders` handlers:

```js
        if (url.pathname === '/api/uploads' && request.method === 'GET') return await handleListUploads(env);
        // Match /retry before /:id — a bare prefix match would swallow it.
        const mr = url.pathname.match(/^\/api\/uploads\/(\d+)\/retry$/);
        if (mr && request.method === 'POST') return await handleRetryUpload(env, Number(mr[1]));
        const mu = url.pathname.match(/^\/api\/uploads\/(\d+)$/);
        if (mu && request.method === 'GET') return await handleGetUpload(env, Number(mu[1]));
        if (mu && request.method === 'PATCH') return await handleUpdateUpload(request, env, Number(mu[1]));
```

- [ ] **Step 4: Deploy**

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler deploy
```

Expected: `Uploaded la-creme-orders`, prints the `workers.dev` URL.

- [ ] **Step 5: End-to-end test — upload, approve, see it in the manifest**

```bash
W="https://la-creme-orders.lacreme.workers.dev"
cd "/c/xampp/htdocs/La creme"
node -e "require('fs').writeFileSync('/tmp/lc-test.jpg', Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64'))"

CB="e2e$(date +%s)"
echo "--- upload (expect 201) ---"
curl -s -o /tmp/up -w "%{http_code}\n" -X POST "$W/api/upload" \
  -F "category=Small Chops" -F "clientBatchId=$CB" -F "batchTotal=1" \
  -F "clientWidth=4" -F "clientHeight=3" -F "filename=e2e.jpg" \
  -F "file=@/tmp/lc-test.jpg;type=image/jpeg"
cat /tmp/up; echo

echo "--- manifest before approval (expect []) ---"
curl -s "$W/api/gallery?cb=$RANDOM$RANDOM"; echo

echo "--- login ---"
curl -s -o /tmp/login -X POST "$W/api/login" -H "Content-Type: application/json" \
  -d '{"password":"YOUR_ADMIN_PASSWORD"}'
TOK=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/login','utf8')).token)")
[ -n "$TOK" ] && echo "token ok" || { echo "LOGIN FAILED — check ADMIN_PASSWORD"; exit 1; }

echo "--- list batches (expect 1 row, stored_count 1) ---"
curl -s "$W/api/uploads" -H "Authorization: Bearer $TOK"; echo

BID=$(curl -s "$W/api/uploads" -H "Authorization: Bearer $TOK" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).batches[0].id))")
IID=$(curl -s "$W/api/uploads/$BID" -H "Authorization: Bearer $TOK" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).items[0].id))")
echo "batch=$BID item=$IID"

echo "--- approve (expect 200) ---"
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH "$W/api/uploads/$IID" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"status":"Approved"}'

echo "--- manifest AFTER approval (expect 1 item, id 'u<N>', category Small Chops, aspect 1.3333) ---"
curl -s "$W/api/gallery?cb=$RANDOM$RANDOM"; echo

echo "--- reject (expect 200) ---"
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH "$W/api/uploads/$IID" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"status":"Rejected"}'

echo "--- manifest after rejection (expect []) ---"
curl -s "$W/api/gallery?cb=$RANDOM$RANDOM"; echo

echo "--- restore to Pending (expect 200) ---"
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH "$W/api/uploads/$IID" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"status":"Pending"}'
echo "--- manifest still [] while Pending (expect []) ---"
curl -s "$W/api/gallery?cb=$RANDOM$RANDOM"; echo

echo "--- unauthenticated admin list (expect 401) ---"
curl -s -o /dev/null -w "%{http_code}\n" "$W/api/uploads"

echo "--- retry a Pending item (expect 400) ---"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$W/api/uploads/$IID/retry" -H "Authorization: Bearer $TOK"
```

> The `?cb=` suffix on `/api/gallery` is **required**, not decoration. The endpoint sends `Cache-Control: public, max-age=60`; without a cache-buster a second call within the minute can return the previous state and make a correct implementation look broken.

Expected sequence: `201`, `[]`, `token ok`, 1 batch row, `200`, one manifest item with `"id":"u…"` / `"category":"Small Chops"` / `"aspect":1.3333`, `200`, `[]`, `200`, `[]`, `401`, `400`.

- [ ] **Step 6: Clean up the test artefacts**

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler d1 execute la-creme-orders --remote --command="SELECT r2_key FROM upload_items" \
  | grep -oE 'img/[a-z0-9-]+/[a-f0-9-]+\.jpg' > /tmp/keys.txt
while read -r k; do
  echo "deleting $k"
  npx wrangler r2 object delete "la-creme-media/$k" --remote
done < /tmp/keys.txt
npx wrangler d1 execute la-creme-orders --remote --command="DELETE FROM upload_items; DELETE FROM upload_batches; DELETE FROM upload_rate;"
rm -f /tmp/keys.txt /tmp/lc-test.jpg /tmp/up /tmp/login
npx wrangler r2 bucket info la-creme-media | grep object_count   # back to 334
```

Expected: `Delete complete.` per key, `object_count: 334`.

- [ ] **Step 7: Commit**

```bash
cd "/c/xampp/htdocs/La creme"
git add worker/index.js
git commit -m "Add gallery manifest and admin upload endpoints

GET /api/gallery returns only Approved items, cached for 60s, shaped to
match GALLERY_ITEMS so gallery.js can append them. ids are namespaced
'u<rowid>' to avoid colliding with the hardcoded ids in gallery-data.js.

Admin routes sit behind the existing isAuthed(): list batches, fetch one
batch with its items, approve/reject, retry.

Retry is a re-verification, not a re-write — the original bytes are never
retained server-side (spec 8 tells the owner to re-send from her phone),
so retry only recovers the case where the R2 write landed but we failed
to confirm it. Otherwise it returns 409 with that instruction.

Adds GET /api/uploads/:id beyond spec 6.3's three routes: returning items
for every batch at once would be ~10k rows at the 200-file cap."
```

---

### Task 5: `upload.html` + `upload.js`

**Files:**
- Create: `upload.html`
- Create: `upload.js`

**Interfaces:**
- Consumes: `MEDIA_CATEGORIES`, `CONFIG.ordersApi`, `escapeHtml` from `config.js` (loaded first, `upload.html`'s script order).
- Produces: the page itself. `POST /api/upload` multipart with `file` / `category` / `clientBatchId` / `batchTotal` / `clientWidth` / `clientHeight` / `filename` — exactly the field names Task 3's handler reads.

> **EXIF rotation, a deliberate scope addition.** Spec §13 lists "automatic EXIF rotation" as out of scope, but the primary device is a phone: an iPhone portrait photo carries an EXIF orientation tag, and `drawImage` does **not** apply it. Every portrait shot would land in the gallery sideways — immediately visible and impossible for the owner to fix, since she can't re-categorise or rotate after upload (§13 also excludes that). The resize step therefore uses `createImageBitmap(file, { imageOrientation: 'from-image' })` with an `Image()` fallback. It costs six lines and prevents the pipeline's single most obvious defect.

- [ ] **Step 1: Create `upload.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<!--
  UNLISTED PAGE. Never link this from index.html or gallery.html, and
  never add a nav entry for it. POST /api/upload has no authentication
  (see spec 6.4 / 11) — keeping the URL out of the site and out of
  search engines is the only thing protecting the bucket from junk
  uploads. Share the URL with the business owner by message only.
-->
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#7A0A1D">
<title>Upload Photos | La Crème</title>
<link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png">
<script src="config.js" defer></script>
<script src="upload.js" defer></script>
<style>
  :root{ --wine:#7A0A1D; --ink:#18130F; --ivory:#FBF4E9; --muted:#6b6058; --line:#e4d9c8; --gold:#C7A155; --card:#fff; }
  *{ box-sizing:border-box; }
  body{ margin:0; font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink); background:var(--ivory); -webkit-text-size-adjust:100%; }
  button,select,input{ font:inherit; }
  [hidden]{ display:none !important; }
  .wrap{ max-width:560px; margin:0 auto; padding:26px 18px calc(44px + env(safe-area-inset-bottom)); }
  h1{ margin:0 0 4px; font-size:1.5rem; letter-spacing:.01em; }
  .hint{ color:var(--muted); font-size:.93rem; margin:0; }
  .step{ margin:28px 0 0; }
  .lbl{ display:block; font-weight:600; font-size:.78rem; letter-spacing:.09em; text-transform:uppercase; color:var(--muted); margin-bottom:9px; }
  .field{ width:100%; padding:15px 14px; border:1px solid var(--line); border-radius:10px; background:#fff; font-size:16px; min-height:54px; appearance:auto; }
  .field:focus{ outline:2px solid var(--wine); outline-offset:1px; }
  .big{ display:block; width:100%; min-height:58px; padding:16px; border-radius:12px; border:1px dashed var(--wine); background:#fff; color:var(--wine); font-weight:600; font-size:1.02rem; cursor:pointer; }
  .big.primary{ border:1px solid var(--wine); background:var(--wine); color:#fff; }
  .big.primary:disabled{ opacity:.55; cursor:default; }
  .big.ghost{ border:1px solid var(--line); background:transparent; color:var(--ink); }
  .err{ color:#b00020; font-size:.9rem; margin:9px 0 0; min-height:1.2em; }
  .thumbs{ list-style:none; margin:16px 0 0; padding:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(78px,1fr)); gap:8px; }
  .thumbs li{ position:relative; aspect-ratio:1; border-radius:9px; overflow:hidden; background:#ece4d6; border:1px solid var(--line); }
  .thumbs img{ width:100%; height:100%; object-fit:cover; display:block; }
  .thumbs .badge{ position:absolute; right:4px; bottom:4px; font-size:.66rem; line-height:1.5; background:rgba(122,10,29,.94); color:#fff; padding:1px 6px; border-radius:999px; }
  .thumbs li.bad .badge{ background:#b00020; }
  .thumbs li.prep{ display:grid; place-items:center; font-size:.78rem; color:var(--muted); }
  .prog{ margin-top:16px; }
  .progBar{ height:9px; border-radius:999px; background:#e8dfcf; overflow:hidden; }
  .progBar span{ display:block; height:100%; width:0; background:var(--wine); transition:width .18s linear; }
  .done{ text-align:center; padding:34px 16px; background:var(--card); border:1px solid var(--line); border-radius:14px; }
  .done .tick{ font-size:2.7rem; line-height:1; }
  .done .count{ font-size:1.15rem; font-weight:600; margin:12px 0 4px; }
  .done .big{ margin-top:22px; }
  @media (max-width:430px){ .thumbs{ grid-template-columns:repeat(auto-fill,minmax(66px,1fr)); } }
</style>
</head>
<body>
<main class="wrap">
  <h1>Upload Photos</h1>
  <p class="hint">Choose a category, then pick your photos.</p>

  <section class="step">
    <label class="lbl" for="category">1 · Category</label>
    <select id="category" class="field" aria-describedby="catErr">
      <option value="">Choose a category…</option>
    </select>
    <p class="err" id="catErr" role="alert"></p>
  </section>

  <section class="step">
    <span class="lbl">2 · Photos</span>
    <input type="file" id="fileInput" accept="image/*" multiple hidden>
    <button class="big" type="button" id="pickBtn">Choose photos</button>
    <p class="hint" id="pickHint"></p>
    <ul class="thumbs" id="thumbs"></ul>
    <p class="err" id="prepErr" role="alert"></p>
  </section>

  <section class="step">
    <button class="big primary" type="button" id="sendBtn" hidden>Send photos</button>
    <div class="prog" id="prog" hidden>
      <div class="progBar"><span id="progFill"></span></div>
      <p class="hint" id="progText"></p>
    </div>
    <p class="err" id="sendErr" role="alert"></p>
  </section>

  <section class="step done" id="done" hidden>
    <div class="tick" aria-hidden="true">✅</div>
    <p class="count" id="doneCount"></p>
    <p class="hint">They'll appear in the gallery once they've been reviewed.</p>
    <button class="big ghost" type="button" id="againBtn">Send more</button>
  </section>

  <p class="err" id="fatal" role="alert"></p>
</main>
</body>
</html>
```

- [ ] **Step 2: Create `upload.js`**

```js
/* ============================================================
   UPLOAD PAGE — mobile-first intake for the business owner.
   Three moves: pick a category, pick photos, send. No login.

   Each photo is resized on-device (long edge 2400px, JPEG ~0.82) so a
   23-photo batch is ~7MB instead of ~150MB, then uploaded ONE AT A TIME
   with a per-file progress bar — if the connection drops on photo 14 of
   23, only photo 14 retries.

   The Worker writes to R2 and HEAD-verifies before it records anything,
   so a file shown here as "sent" is genuinely in storage.
============================================================ */
const $ = (id)=> document.getElementById(id);
const API = (CONFIG.ordersApi || '').replace(/\/+$/, '');

const MAX_EDGE = 2400;
const JPEG_QUALITY = 0.82;
const MAX_FILES = 200;
const RETRIES = 3;
const RETRY_BACKOFF_MS = 600;

// One id per upload SESSION. Every file in a session carries it so the
// Worker can group them into a single dashboard row and one Telegram
// message instead of N of each (spec 7, Task 2). `reset()` mints a new
// one, so "Send more" after a completed upload starts a fresh batch
// rather than growing the old one — which also keeps file_count honest:
// the Worker stops counting at the total declared by the first file.
let CLIENT_BATCH_ID = '';
function newBatchId(){
  CLIENT_BATCH_ID = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
newBatchId();

let prepared = [];      // [{ blob, width, height, name, status, error, onProgress }]
let sending = false;
let BATCH_TOTAL = 0;    // set in sendAll() — the count the Worker records
const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));

/* ---------- boot ---------- */
if(!API){
  $('fatal').textContent = 'Uploads are not configured yet.';
} else if(typeof MEDIA_CATEGORIES === 'undefined'){
  $('fatal').textContent = 'Could not load the category list.';
} else {
  MEDIA_CATEGORIES.forEach(cat=>{
    const o = document.createElement('option');
    o.value = cat;
    o.textContent = cat;
    $('category').append(o);
  });
}

$('category').addEventListener('change', ()=>{ $('catErr').textContent = ''; });
$('pickBtn').addEventListener('click', ()=> $('fileInput').click());
$('fileInput').addEventListener('change', (e)=> onFiles([...e.target.files]));
$('sendBtn').addEventListener('click', sendAll);
$('againBtn').addEventListener('click', reset);

/* ---------- resize ---------- */
async function resizeImage(file){
  // imageOrientation:'from-image' bakes the EXIF orientation in, so a
  // portrait phone photo doesn't land in the gallery rotated 90°.
  let src, w, h;
  try{
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    src = bmp; w = bmp.width; h = bmp.height;
  }catch(err){
    src = await new Promise((res, rej)=>{
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = ()=>{ URL.revokeObjectURL(url); res(img); };
      img.onerror = (e)=>{ URL.revokeObjectURL(url); rej(e); };
      img.src = url;
    });
    w = src.naturalWidth; h = src.naturalHeight;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  canvas.getContext('2d').drawImage(src, 0, 0, outW, outH);
  if(src.close) src.close();

  const blob = await new Promise(res=> canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
  if(!blob) throw new Error('Could not re-encode that photo.');
  return { blob, width: outW, height: outH };
}

/* ---------- selection ---------- */
async function onFiles(files){
  if(!files.length) return;
  if(prepared.length + files.length > MAX_FILES){
    $('prepErr').textContent = `You can send up to ${MAX_FILES} photos at a time.`;
    files = files.slice(0, MAX_FILES - prepared.length);
    if(!files.length) return;
  }
  $('catErr').textContent = '';
  $('prepErr').textContent = '';

  // Thumbnails appear as they're chosen (spec 5), so the list grows
  // during the resize loop rather than after it.
  const list = $('thumbs');
  for(const file of files){
    const li = document.createElement('li');
    li.className = 'prep';
    li.textContent = 'Preparing…';
    list.append(li);

    const entry = { blob:null, width:0, height:0, name:file.name || 'photo.jpg', status:'prep', error:null, onProgress:()=>{}, el:li };
    prepared.push(entry);

    try{
      const out = await resizeImage(file);
      entry.blob = out.blob; entry.width = out.width; entry.height = out.height;
      entry.status = 'ready';
      const img = document.createElement('img');
      img.alt = '';
      img.src = URL.createObjectURL(out.blob);
      li.className = '';
      li.replaceChildren(img);
    }catch(err){
      entry.status = 'failed';
      entry.error = err && err.message ? err.message : 'Could not prepare that photo.';
      li.className = 'bad';
      li.replaceChildren(Object.assign(document.createElement('span'), { className:'badge', textContent:'failed' }));
      $('prepErr').textContent = entry.error;
    }
  }

  const ready = prepared.filter(p=> p.status === 'ready').length;
  $('pickHint').textContent = `${prepared.length} photo${prepared.length === 1 ? '' : 's'} selected · ${ready} ready`;
  $('pickBtn').textContent = 'Choose more photos';
  $('sendBtn').hidden = ready === 0;
  $('sendBtn').textContent = `Send ${ready} photo${ready === 1 ? '' : 's'}`;
}

/* ---------- upload ---------- */
function uploadOne(entry){
  return new Promise((resolve, reject)=>{
    const fd = new FormData();
    fd.append('category', $('category').value);
    fd.append('clientBatchId', CLIENT_BATCH_ID);
    fd.append('batchTotal', String(BATCH_TOTAL));
    fd.append('clientWidth', String(entry.width));
    fd.append('clientHeight', String(entry.height));
    fd.append('filename', entry.name);
    fd.append('file', entry.blob, entry.name);

    // XHR, not fetch: fetch gives no upload progress event, and the
    // per-file progress bar is the whole point of sending one at a time.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/upload');
    xhr.timeout = 60000;
    xhr.upload.onprogress = (e)=>{ if(e.lengthComputable) entry.onProgress(e.loaded / e.total); };
    xhr.onload = ()=>{
      if(xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Upload failed (${xhr.status})`;
      try{ const j = JSON.parse(xhr.responseText); if(j.error) msg = j.error; }catch(e){}
      const err = new Error(msg);
      // 4xx means the server decided this exact request will never work
      // (unknown category, too large, rate limited) — retrying wastes
      // the owner's time and battery. Only network faults and 5xx retry.
      err.retryable = xhr.status >= 500 || xhr.status === 0;
      reject(err);
    };
    xhr.onerror = ()=>{ const e = new Error('Network error — check your connection.'); e.retryable = true; reject(e); };
    xhr.ontimeout = ()=>{ const e = new Error('That took too long.'); e.retryable = true; reject(e); };
    xhr.send(fd);
  });
}

async function sendAll(){
  if(sending) return;
  if(!$('category').value){
    $('catErr').textContent = 'Choose a category first.';
    $('category').focus();
    return;
  }

  const queue = prepared.filter(p=> p.status === 'ready' || p.status === 'failed');
  if(!queue.length) return;
  // A re-send after failures starts a NEW batch. The old row keeps its
  // accurate "N failed" history and the new one counts from zero, so
  // file_count can actually reconcile with stored_count — reusing the id
  // would stack duplicate failed rows inside one batch and leave status
  // stuck on 'Partial' even after every photo eventually stores.
  if(queue.some(p=> p.status === 'failed')) newBatchId();
  queue.forEach(p=>{ p.status = 'ready'; p.error = null; });
  // Declared once, from exactly what we are about to send. Anything else
  // (files still resizing, or already sent) would make file_count exceed
  // stored_count + failed_count, so the batch could never reach Complete.
  BATCH_TOTAL = queue.length;

  sending = true;
  $('sendBtn').disabled = true;
  $('sendErr').textContent = '';
  $('prog').hidden = false;
  updateProgress(0, 0);

  for(let i = 0; i < queue.length; i++){
    const entry = queue[i];
    entry.onProgress = (frac)=> updateProgress(i, frac);

    let attempt = 0, err = null;
    while(attempt < RETRIES){
      try{
        await uploadOne(entry);
        entry.status = 'sent'; entry.error = null; err = null; break;
      }catch(e){
        err = e;
        attempt++;
        if(attempt < RETRIES && e.retryable) await sleep(RETRY_BACKOFF_MS * attempt);
        if(attempt < RETRIES && !e.retryable) break;
      }
    }

    if(err){
      entry.status = 'failed';
      entry.error = err.message;
      markFailed(entry);
    } else {
      entry.status = 'sent';
      entry.error = null;
      clearFailedMark(entry);   // drops a 'retry' badge left by an earlier run
    }
    updateProgress(i + 1, 0);
  }

  sending = false;
  $('sendBtn').disabled = false;
  finish();
}

function updateProgress(done, frac){
  // BATCH_TOTAL, not a recount: during a retry run the other entries are
  // 'sent' or 'failed' and would make the denominator wrong.
  const total = BATCH_TOTAL || 1;
  const pct = Math.min(100, Math.round(((done + frac) / total) * 100));
  $('progFill').style.width = pct + '%';
  $('progText').textContent = done < total ? `Sending ${done + 1} of ${total}…` : 'Finishing…';
}

function markFailed(entry){
  // The entry holds its own <li> — queue index and thumbs index diverge
  // as soon as any earlier photo was skipped or already sent. The image
  // is left in place so a retry doesn't blank her thumbnail.
  const li = entry.el;
  if(!li) return;
  li.className = 'bad';
  if(li.querySelector('.badge')) return;
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = 'retry';
  li.append(badge);
}

function clearFailedMark(entry){
  const li = entry.el;
  if(!li) return;
  li.className = '';
  const badge = li.querySelector('.badge');
  if(badge) badge.remove();
}

function finish(){
  const sent = prepared.filter(p=> p.status === 'sent').length;
  const failed = prepared.filter(p=> p.status === 'failed').length;

  $('prog').hidden = true;
  $('sendBtn').hidden = true;

  if(failed === 0){
    $('doneCount').textContent = `${sent} photo${sent === 1 ? '' : 's'} sent ✅`;
    $('done').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // Never drop a failure silently (spec 5.2).
  $('sendErr').textContent =
    `${sent} sent, ${failed} not sent. ` +
    `Those ${failed} are still on your phone — tap Retry to send them again.`;
  $('sendBtn').hidden = false;
  const retryable = prepared.filter(p=> p.status === 'failed').length;
  $('sendBtn').textContent = `Retry ${retryable} photo${retryable === 1 ? '' : 's'}`;
}

function reset(){
  prepared = [];
  $('thumbs').replaceChildren();
  $('fileInput').value = '';
  $('pickHint').textContent = '';
  $('pickBtn').textContent = 'Choose photos';
  $('sendBtn').hidden = true;
  $('sendBtn').disabled = false;
  $('prog').hidden = true;
  $('progFill').style.width = '0%';
  $('sendErr').textContent = '';
  $('prepErr').textContent = '';
  $('catErr').textContent = '';
  $('done').hidden = true;
  // Same CLIENT_BATCH_ID — a second session from the same page view is
  // still the same logical upload, so it stays one dashboard row.
}
```

- [ ] **Step 3: Verify the page renders and the dropdown matches the gallery**

```bash
npx --yes serve -l 8080 "/c/xampp/htdocs/La creme"
```

Open `http://localhost:8080/upload.html`. Expected:

1. Console has **no errors** — in particular no `MEDIA_CATEGORIES is not defined` (that means `config.js` loaded after `upload.js`; check both `defer` attributes and their order).
2. The dropdown lists exactly 9 options in gallery order: `Traditional Wedding Cakes`, `Anniversary`, `Cakes for Boys`, `Cakes for Girls`, `Cakes for Men`, `Cakes for Women`, `Wedding Cakes`, `Catering & Events`, `Small Chops`.
3. View source / Elements: `<meta name="robots" content="noindex, nofollow">` is present.
4. `document.querySelectorAll('a[href*="upload"]').length` in the console is **0** — no link to this page from anywhere.

- [ ] **Step 4: Verify the failure → retry path**

This is the path most likely to be broken and easiest to get silently wrong, so exercise it explicitly.

1. Open `http://localhost:8080/upload.html`, choose a category, pick **3 photos**, and click **Send**.
2. As soon as the progress bar appears, DevTools → **Network → Offline**.
3. Expected: each photo fails after its automatic retries, thumbnails keep their images but gain a red `retry` badge, and the page shows **`0 sent, 3 not sent. Those 3 are still on your phone — tap Retry to send them again.`** with the button relabelled **`Retry 3 photos`**. Nothing is silently dropped (spec 5.2).
4. Set Network back to **Online**, click **`Retry 3 photos`**.
5. Expected: progress completes, badges clear, **`3 photos sent ✅`** appears.
6. Confirm the batch accounting is honest:

   ```bash
   cd "/c/xampp/htdocs/La creme/worker"
   npx wrangler d1 execute la-creme-orders --remote --command="SELECT id, client_batch_id, file_count, stored_count, failed_count, status FROM upload_batches ORDER BY id"
   npx wrangler d1 execute la-creme-orders --remote --command="SELECT COUNT(*) AS items FROM upload_items"
   ```

   Expected: **two** rows — the first `Partial` with `failed_count = 3`, the second `Complete` with `stored_count = 3` — and `items = 6` (3 failed attempts kept as history, 3 stored). A single row with `stored_count = 6`, a `Partial` that never resolves, or `items = 3` all indicate the batch-id / recount logic regressed.

   Two rows is correct and intentional: a re-send is a new batch, so the old one keeps an accurate record of what failed rather than being overwritten.

7. Remove the test artefacts before moving on:

   ```bash
   cd "/c/xampp/htdocs/La creme/worker"
   npx wrangler d1 execute la-creme-orders --remote --command="SELECT r2_key FROM upload_items" \
     | grep -oE 'img/[a-z0-9-]+/[a-f0-9-]+\.jpg' > /tmp/keys.txt
   while read -r k; do npx wrangler r2 object delete "la-creme-media/$k" --remote; done < /tmp/keys.txt
   npx wrangler d1 execute la-creme-orders --remote --command="DELETE FROM upload_items; DELETE FROM upload_batches; DELETE FROM upload_rate;"
   rm -f /tmp/keys.txt
   npx wrangler r2 bucket info la-creme-media | grep object_count   # back to 334
   ```

- [ ] **Step 5: Commit**

```bash
cd "/c/xampp/htdocs/La creme"
git add upload.html upload.js
git commit -m "Add the mobile upload page

upload.html + upload.js: pick a category, pick photos, send. No login,
no PIN — the unlisted URL is the only gate (spec 6.4).

Photos are resized on-device to a 2400px long edge at JPEG 0.82, then
uploaded one at a time with XHR so each file gets its own progress bar
and its own retry. A dropped connection on photo 14 of 23 costs one
photo, not the batch.

Failures are surfaced, never dropped: the page says how many did not send
and offers Retry. A re-send mints a new batch id so the original row keeps
its accurate failed count instead of double-counting failed attempts into
one batch that can never reconcile.

batchTotal is declared from exactly the files about to be sent — counting
files still resizing or already sent would leave file_count above
stored_count + failed_count and pin the batch status on Pending.

Each entry carries a reference to its own thumbnail rather than indexing
by queue position, which diverges as soon as any photo is skipped.

Uses createImageBitmap with imageOrientation:'from-image' rather than a
bare Image() load: drawImage does not apply EXIF orientation, so portrait
phone photos would otherwise arrive in R2 rotated 90 degrees. Spec 13
lists EXIF as out of scope, but the primary device is a phone and there
is no post-upload rotation path either.

Carries noindex,nofollow and is deliberately not linked from either
site page."
```

---

### Task 6: `gallery.js` manifest merge

**Files:**
- Modify: `gallery.js` (three regions: counts, filter buttons, post-render fetch)

**Interfaces:**
- Consumes: `CONFIG.ordersApi` (Task 1), `GET /api/gallery` (Task 4), `ICONS` at `gallery.js:157`, `MEDIA_CATEGORIES` from Task 1.
- Produces: nothing externally — this is a read-only consumer. Behaviour: approved uploads appear in the grid without any code edit or deploy.

> **Why three separate edits.** `gallery.js` computes counts at line 186, builds filter buttons inline at line 472, and renders at line 490 — all synchronous, all before any network call. The merge has to re-run the first two and re-render the third, so the inline blocks become named functions. Nothing about the initial render changes: hardcoded `GALLERY_ITEMS` still paints first (spec 9's "rendered immediately"), and the fetch only ever adds to it.

- [ ] **Step 1: Turn the counts block into a re-runnable function**

Replace `gallery.js:186-196` — the whole block from `const categoryCounts = filterCategories.reduce(...)` through the `categoryCounts['Cakes'] = CAKE_FILTER_CATEGORIES.reduce(...)` line — with:

```js
const categoryCounts = {};
function recomputeCategoryCounts(){
  Object.keys(categoryCounts).forEach(k=> delete categoryCounts[k]);
  filterCategories.forEach(cat=>{
    categoryCounts[cat] = cat === 'All' ? galleryItems.length : galleryItems.filter(g=> g.category === cat).length;
  });
  // Synthetic aggregate — 'Cakes' isn't a real filter tab anymore (it's
  // split across CAKE_FILTER_CATEGORIES), but the editorial break below
  // still wants one combined count to show. Includes the photos still
  // tagged plain 'Cakes' (the catch-all for ones that don't fit a specific
  // occasion/recipient tab) — they're cakes too, just not on their own tab.
  categoryCounts['Cakes'] = CAKE_FILTER_CATEGORIES.reduce((n, cat)=> n + (categoryCounts[cat] || 0), 0)
    + galleryItems.filter(g=> g.category === 'Cakes').length;
}
recomputeCategoryCounts();
```

`categoryCounts` stays `const` — it is mutated in place, never reassigned.

- [ ] **Step 2: Turn the filter-button block into a rebuildable function**

Replace `gallery.js:468-490` — from `const galFilters = ...` through `resetGrid(initialFilter);` — with:

```js
const galFilters = document.getElementById('galFilters');
const urlFilter = new URLSearchParams(location.search).get('filter');
const initialFilter = filterCategories.includes(urlFilter) ? urlFilter : 'All';
activeFilter = initialFilter;

function buildFilterButtons(){
  galFilters.replaceChildren();
  filterCategories.forEach((cat)=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gal-filter' + (cat === activeFilter ? ' active' : '');
    btn.innerHTML = `${cat} <span class="gf-count">${categoryCounts[cat] || 0}</span>`;
    btn.addEventListener('click', ()=>{
      if(activeFilter === cat) return;
      galFilters.querySelectorAll('.gal-filter').forEach(b=> b.classList.remove('active'));
      btn.classList.add('active');
      resetGrid(cat);
    });
    galFilters.appendChild(btn);
  });
}
buildFilterButtons();

// Only matters when the tab bar itself scrolls (narrow screens) and
// the pre-selected filter isn't the first tab — keeps the active
// one from landing off-screen.
const initialFilterBtn = galFilters.querySelector('.gal-filter.active');
if(initialFilterBtn && activeFilter !== 'All') initialFilterBtn.scrollIntoView({ inline: 'center', block: 'nearest' });

resetGrid(initialFilter);
```

> `btn.innerHTML` interpolates `cat`, which comes from `MEDIA_CATEGORIES` — a literal array you wrote, not user input. Per CLAUDE.md's `escapeHtml()` rule this is safe as-is (same as the original code); do not "fix" it. `'Catering & Events'` contains `&`, and running it through `escapeHtml()` would render it as `Catering &amp; Events` on screen.

- [ ] **Step 3: Add the manifest fetch, immediately after `resetGrid(initialFilter);`**

```js
/* ============================================================
   LIVE MANIFEST — approved uploads, fetched after first paint.
   Hardcoded GALLERY_ITEMS renders first; this only ever adds to it,
   so a slow or unreachable API never delays the gallery (spec 9).
============================================================ */
function mergeManifestItems(items){
  if(!Array.isArray(items) || !items.length) return false;
  const seen = new Set(galleryItems.map(g=> g.id));
  let added = 0;
  items.forEach(raw=>{
    if(!raw || seen.has(raw.id)) return;          // dedupe by id
    seen.add(raw.id);
    // iconKey -> this page's ICONS, exactly as static items are resolved
    // at gallery.js:184. Uploaded items always carry an image, so the
    // icon only shows if the image later fails to load.
    galleryItems.push({ ...raw, icon: ICONS[raw.iconKey] || ICONS.cake });
    added++;
  });
  if(!added) return false;

  recomputeCategoryCounts();
  buildFilterButtons();
  // Re-render. This can reshuffle the grid once shortly after load if
  // the API was slow — acceptable, because the alternative (never
  // refreshing) would leave approved photos invisible until a reload.
  if(filterCategories.includes(activeFilter)) resetGrid(activeFilter);
  return true;
}

async function loadManifest(){
  if(!CONFIG.ordersApi) return;
  const KEY = 'lcGalleryManifest';

  // 3s session cache (spec 9) — gallery.html is navigated to often
  // enough that refetching on every visit would be needless D1 reads.
  try{
    const raw = sessionStorage.getItem(KEY);
    if(raw){
      const at = Number(sessionStorage.getItem(KEY + 'At') || 0);
      if(Date.now() - at < 3000){ mergeManifestItems(JSON.parse(raw)); return; }
    }
  }catch(e){ /* corrupt cache — fall through to a real fetch */ }

  try{
    const ctl = new AbortController();
    const timer = setTimeout(()=> ctl.abort(), 3000);          // spec 9: ~3s
    const res = await fetch(`${CONFIG.ordersApi}/api/gallery`, { signal: ctl.signal });
    clearTimeout(timer);
    if(!res.ok) return;
    const items = await res.json();
    try{
      sessionStorage.setItem(KEY, JSON.stringify(items));
      sessionStorage.setItem(KEY + 'At', String(Date.now()));
    }catch(e){ /* quota — still merge, just don't cache */ }
    mergeManifestItems(items);
  }catch(err){
    // Offline, timed out, or the Worker is down. The hardcoded items
    // are already on screen and the site behaves exactly as it does
    // today (spec 9) — nothing else to do.
  }
}
loadManifest();
```

- [ ] **Step 4: Verify the gallery is unchanged, then verify approved items appear**

```bash
npx --yes serve -l 8080 "/c/xampp/htdocs/La creme"
```

**(a) No regressions.** Open `http://localhost:8080/gallery.html`. Expected:

1. Console: no errors.
2. Filter bar unchanged — 10 tabs, same order, same counts as before this task.
3. `document.querySelectorAll('.gi').length` grows as you scroll (infinite scroll still working).
4. Lightbox still opens/closes on a photo.

**(b) Approved items appear.** With `CONFIG.ordersApi` set, upload one photo via the API and approve it:

```bash
W="https://la-creme-orders.lacreme.workers.dev"
cd "/c/xampp/htdocs/La creme"
node -e "require('fs').writeFileSync('/tmp/lc-test.jpg', Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64'))"
CB="g6$(date +%s)"
curl -s -o /tmp/up -w "upload: %{http_code}\n" -X POST "$W/api/upload" \
  -F "category=Small Chops" -F "clientBatchId=$CB" -F "batchTotal=1" \
  -F "clientWidth=4" -F "clientHeight=3" -F "filename=g6.jpg" \
  -F "file=@/tmp/lc-test.jpg;type=image/jpeg"
TOK=$(curl -s -X POST "$W/api/login" -H "Content-Type: application/json" -d '{"password":"YOUR_ADMIN_PASSWORD"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")
BID=$(curl -s "$W/api/uploads" -H "Authorization: Bearer $TOK" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).batches[0].id))")
IID=$(curl -s "$W/api/uploads/$BID" -H "Authorization: Bearer $TOK" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).items[0].id))")
curl -s -o /dev/null -w "approve: %{http_code}\n" -X PATCH "$W/api/uploads/$IID" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"status":"Approved"}'
```

Now reload `http://localhost:8080/gallery.html` in the browser. Expected:

5. The **Small Chops** tab count is `old count + 1`.
6. The uploaded photo renders as a tile with `data-id="u1"` (the `u` prefix proves it came from the manifest, not `gallery-data.js`).
7. Clicking it opens the lightbox with `alt=""` — no "undefined" text anywhere.
8. `sessionStorage.getItem('lcGalleryManifest')` in the console returns the item array, with `'lcGalleryManifestAt'` set to a fresh timestamp.

**(c) The offline path.** In DevTools → Network, set **Offline**, reload. Expected: the gallery still renders all hardcoded photos with no console errors — `loadManifest()` fails silently exactly as spec 9 requires.

- [ ] **Step 5: Remove the test photo**

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler d1 execute la-creme-orders --remote --command="SELECT r2_key FROM upload_items" \
  | grep -oE 'img/[a-z0-9-]+/[a-f0-9-]+\.jpg' > /tmp/keys.txt
while read -r k; do npx wrangler r2 object delete "la-creme-media/$k" --remote; done < /tmp/keys.txt
npx wrangler d1 execute la-creme-orders --remote --command="DELETE FROM upload_items; DELETE FROM upload_batches; DELETE FROM upload_rate;"
rm -f /tmp/keys.txt /tmp/lc-test.jpg /tmp/up
npx wrangler r2 bucket info la-creme-media | grep object_count   # back to 334
```

- [ ] **Step 6: Commit**

```bash
cd "/c/xampp/htdocs/La creme"
git add gallery.js
git commit -m "Merge approved uploads into the live gallery

gallery.js now fetches GET /api/gallery after first paint and appends the
approved items to the hardcoded GALLERY_ITEMS. Hardcoded content renders
immediately; the fetch only ever adds to it, with a 3s abort and a 3s
session cache, so an offline or slow Worker leaves the gallery exactly as
it is today.

Counts and the filter bar are rebuilt from the merged array so tab badges
stay honest.

ids are namespaced 'u<rowid>' by the Worker, so dedupe by id can't collide
with the numeric ids in gallery-data.js.

Verified: approved item renders with data-id starting 'u', its category
count increments, the lightbox shows no 'undefined', and the gallery still
renders fully with DevTools offline."
```

---

### Task 7: Admin "Uploads" section

**Files:**
- Modify: `admin.html` (tabs markup, uploads panel, CSS)
- Modify: `admin.js` (tab switching, list/detail, approve/reject/retry)

**Interfaces:**
- Consumes: `api()` / `el()` / `fmtDate()` / `TOKEN_KEY` already in `admin.js:7-98`; `GET /api/uploads`, `GET /api/uploads/:id`, `PATCH /api/uploads/:id`, `POST /api/uploads/:id/retry` from Task 4.
- Produces: nothing new — UI only.

> **XSS constraint.** `admin.js:3` documents that every API value goes through `textContent`, never `innerHTML`. Every string below — filename, error text, category — is inserted via `el()`'s `text` prop. Filenames in particular come from her phone and must not be trusted.

- [ ] **Step 1: Add the CSS to `admin.html`**

Insert after the `.none{ ... }` rule (line 72) and **before** the `/* receipt */` comment:

```css
  /* section tabs */
  .tabs{ display:flex; gap:4px; padding:10px 24px 0; background:var(--ivory); border-bottom:1px solid var(--line); position:sticky; top:53px; z-index:4; }
  .tab{ padding:11px 18px; border:0; background:transparent; color:var(--muted); font-weight:600; font-size:.9rem; border-bottom:2px solid transparent; cursor:pointer; }
  .tab:hover{ color:var(--ink); }
  .tab.active{ color:var(--wine); border-bottom-color:var(--wine); }

  /* upload item statuses */
  .pill.Pending{ background:#fff3d6; color:#8a5a00; }
  .pill.Approved{ background:#e2f4e6; color:#1d6b32; }
  .pill.Rejected{ background:#f1f1f1; color:#999; }
  .pill.Failed{ background:#fde8ea; color:var(--wine); }

  /* batch detail: photo cards */
  .up-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr)); gap:14px; }
  .up-card{ border:1px solid var(--line); border-radius:10px; overflow:hidden; background:#fff; display:flex; flex-direction:column; }
  .up-card img{ width:100%; aspect-ratio:1; object-fit:cover; display:block; background:#efe7d9; }
  .up-card .broken{ display:grid; place-items:center; aspect-ratio:1; background:#efe7d9; color:var(--muted); font-size:.8rem; }
  .up-card .meta{ padding:9px 10px; font-size:.76rem; color:var(--muted); display:flex; flex-direction:column; gap:3px; }
  .up-card .meta .fname{ color:var(--ink); font-weight:600; word-break:break-all; }
  .up-card .msg{ padding:0 10px; font-size:.74rem; color:#b00020; }
  .up-card .acts{ display:flex; gap:6px; padding:9px 10px 10px; margin-top:auto; }
  .up-card .acts .btn{ flex:1; padding:9px 6px; font-size:.78rem; }
```

- [ ] **Step 2: Add the tabs and the uploads panel to `admin.html`**

Replace the whole `<div id="appView" hidden> ... </div>` block (lines 100-124) with:

```html
<div id="appView" hidden>
  <header class="top">
    <h1 id="pageTitle">LA CRÈME · ORDERS</h1>
    <div class="right">
      <span id="updated" style="font-size:.78rem;opacity:.7"></span>
      <button class="btn" id="refreshBtn" type="button">Refresh</button>
      <button class="btn" id="logoutBtn" type="button">Sign out</button>
    </div>
  </header>

  <nav class="tabs">
    <button class="tab active" id="tabOrders" type="button">Orders</button>
    <button class="tab" id="tabUploads" type="button">Uploads</button>
  </nav>

  <main id="ordersPanel">
    <section>
      <div class="filters">
        <input class="field" id="search" type="search" placeholder="Search number, name, phone or items">
        <select class="field" id="statusFilter"><option value="">All statuses</option></select>
        <select class="field" id="typeFilter">
          <option value="">All types</option><option>Cake</option><option>Finger Foods</option>
          <option>Catering</option>
        </select>
      </div>
      <p class="stats" id="stats"></p>
      <div class="list" id="list"></div>
    </section>
    <aside class="detail" id="detail"><div class="none">Select an order to see the full details.</div></aside>
  </main>

  <main id="uploadsPanel" hidden>
    <section>
      <p class="stats" id="upStats"></p>
      <div class="list" id="batchList"></div>
    </section>
    <aside class="detail" id="batchDetail"><div class="none">Select an upload to see its photos.</div></aside>
  </main>
</div>
```

- [ ] **Step 3: Add tab switching and refresh routing to `admin.js`**

Replace line 69 —

```js
$('refreshBtn').addEventListener('click', ()=> loadOrders());
```

— with:

```js
$('tabOrders').addEventListener('click', ()=> switchTab('orders'));
$('tabUploads').addEventListener('click', ()=> switchTab('uploads'));
$('refreshBtn').addEventListener('click', ()=> refreshActive());

function switchTab(which){
  const orders = which === 'orders';
  $('tabOrders').classList.toggle('active', orders);
  $('tabUploads').classList.toggle('active', !orders);
  $('ordersPanel').hidden = !orders;
  $('uploadsPanel').hidden = orders;
  $('pageTitle').textContent = orders ? 'LA CRÈME · ORDERS' : 'LA CRÈME · UPLOADS';
  if(!orders) loadUploads();
}
function refreshActive(){
  if($('uploadsPanel').hidden) loadOrders(); else loadUploads();
}
```

- [ ] **Step 4: Add the Uploads code to `admin.js`**

Insert before `/* ---------- boot ---------- */` at line 188:

```js
/* ---------- uploads ---------- */
let batches = [];
let selectedBatchId = null;

function fmtBytes(n){
  n = Number(n) || 0;
  if(n < 1024) return n + ' B';
  if(n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

async function loadUploads(){
  try{
    const data = await api('/api/uploads');
    batches = data.batches;
    $('upStats').textContent = batches.length
      ? `${batches.length} upload${batches.length === 1 ? '' : 's'} · ${batches.reduce((n, b)=> n + b.file_count, 0)} photos`
      : 'No uploads yet.';
    $('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
    renderUploadList();
    if(selectedBatchId) renderBatchDetail();
  }catch(err){
    $('upStats').textContent = err.message;
  }
}

function renderUploadList(){
  const list = $('batchList');
  list.replaceChildren();
  if(!batches.length){
    list.append(el('div', { class:'empty', text:'No uploads yet.' }));
    return;
  }
  batches.forEach(b=>{
    const parts = [];
    if(b.approved) parts.push(`${b.approved} approved`);
    if(b.pending)  parts.push(`${b.pending} pending`);
    if(b.rejected) parts.push(`${b.rejected} rejected`);
    if(b.failed)   parts.push(`${b.failed} failed`);

    const row = el('div', { class:'row' + (b.id === selectedBatchId ? ' active' : ''), tabindex:'0' },
      el('div', {},
        el('div', { class:'no', text:`${b.file_count} photo${b.file_count === 1 ? '' : 's'} · ${b.category}` }),
        el('div', { class:'who', text:parts.join(' · ') })
      ),
      el('div', { class:'meta' },
        el('div', { class:'total', text:fmtBytes(b.total_bytes) }),
        el('div', { text:fmtDate(b.received_at) }),
        el('span', { class:`pill ${b.status}`, text:b.status })
      )
    );
    const open = ()=>{ selectedBatchId = b.id; renderUploadList(); renderBatchDetail(); };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') open(); });
    list.append(row);
  });
}

async function renderBatchDetail(){
  const box = $('batchDetail');
  box.replaceChildren();
  if(!selectedBatchId){
    box.append(el('div', { class:'none', text:'Select an upload to see its photos.' }));
    return;
  }
  box.append(el('div', { class:'none', text:'Loading…' }));

  let data;
  try{
    data = await api(`/api/uploads/${selectedBatchId}`);
  }catch(err){
    box.replaceChildren(el('div', { class:'none', text:err.message }));
    return;
  }
  const { batch, items } = data;

  box.replaceChildren(
    el('h2', { text:`${batch.file_count} photo${batch.file_count === 1 ? '' : 's'}` }),
    el('div', { class:'sub', text:`${batch.category} · ${fmtDate(batch.received_at)} · ${fmtBytes(batch.total_bytes)}` })
  );
  const grid = el('div', { class:'up-grid' });
  items.forEach(it=> grid.append(uploadCard(it)));
  box.append(grid);
}

function uploadCard(item){
  const card = el('div', { class:'up-card' });

  if(item.image_url){
    const img = el('img', { alt:'' });
    img.loading = 'lazy';
    img.src = item.image_url;
    // Rejected items keep their object (spec 6.3), so this renders too —
    // only the manifest excludes them.
    img.addEventListener('error', ()=>{
      const broken = el('div', { class:'broken', text:'no preview' });
      img.replaceWith(broken);
    });
    card.append(img);
  } else {
    card.append(el('div', { class:'broken', text:'no preview' }));
  }

  card.append(el('div', { class:'meta' },
    el('div', { class:'fname', text:item.filename || '' }),
    el('div', { text:`${item.width}×${item.height} · ${fmtBytes(item.bytes)}` }),
    el('span', { class:`pill ${item.status}`, text:item.status })
  ));
  if(item.error) card.append(el('div', { class:'msg', text:item.error }));

  const acts = el('div', { class:'acts' });
  if(item.status === 'Pending'){
    acts.append(
      btn('Approve', 'btn', ()=> setUploadStatus(item, 'Approved')),
      btn('Reject', 'btn ghost', ()=> setUploadStatus(item, 'Rejected'))
    );
  } else if(item.status === 'Approved'){
    acts.append(btn('Unpublish', 'btn ghost', ()=> setUploadStatus(item, 'Pending')));
  } else if(item.status === 'Rejected'){
    acts.append(
      btn('Approve', 'btn', ()=> setUploadStatus(item, 'Approved')),
      btn('Restore', 'btn ghost', ()=> setUploadStatus(item, 'Pending'))
    );
  } else if(item.status === 'Failed'){
    acts.append(btn('Retry', 'btn', ()=> retryUpload(item)));
  }
  card.append(acts);
  return card;
}

function btn(label, cls, onClick){
  const b = el('button', { class:cls, type:'button', text:label });
  b.addEventListener('click', onClick);
  return b;
}

async function setUploadStatus(item, status){
  try{
    await api(`/api/uploads/${item.id}`, { method:'PATCH', body: JSON.stringify({ status }) });
  }catch(err){ alert(err.message); return; }
  // Gallery picks this up on its next load — no code edit, no deploy.
  await loadUploads();
  await renderBatchDetail();
}

async function retryUpload(item){
  try{
    await api(`/api/uploads/${item.id}/retry`, { method:'POST' });
  }catch(err){ alert(err.message); return; }
  await loadUploads();
  await renderBatchDetail();
}
```

- [ ] **Step 5: Route the 60s auto-refresh to the visible panel**

Replace line 190 —

```js
setInterval(()=>{ if(!$('appView').hidden && !document.hidden) loadOrders(); }, 60000);
```

— with:

```js
setInterval(()=>{ if(!$('appView').hidden && !document.hidden) refreshActive(); }, 60000);
```

- [ ] **Step 6: Verify in the browser**

Upload two test photos first so the panel has content:

```bash
W="https://la-creme-orders.lacreme.workers.dev"
cd "/c/xampp/htdocs/La creme"
node -e "require('fs').writeFileSync('/tmp/lc-test.jpg', Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64'))"
CB="adm$(date +%s)"
for i in 1 2; do
  curl -s -o /dev/null -w "%{http_code} " -X POST "$W/api/upload" \
    -F "category=Catering & Events" -F "clientBatchId=$CB" -F "batchTotal=2" \
    -F "clientWidth=4" -F "clientHeight=3" -F "filename=photo$i.jpg" \
    -F "file=@/tmp/lc-test.jpg;type=image/jpeg"
done
echo
npx --yes serve -l 8080 "/c/xampp/htdocs/La creme"
```

Open `http://localhost:8080/admin.html`, sign in. Expected:

1. Two tabs — **Orders** (active) and **Uploads**. Orders looks exactly as it did before this task.
2. Click **Uploads**: a row reading `2 photos · Catering & Events`, size, timestamp, and a `Pending` pill. Page title becomes `LA CRÈME · UPLOADS`.
3. Click the row: two cards appear, each with a thumbnail, `photo1.jpg` / `photo2.jpg`, `4×3`, byte size, a `Pending` pill, and **Approve** / **Reject** buttons.
4. Click **Approve** on one: its pill flips to `Approved`, its button becomes **Unpublish**, and the batch row now reads `1 approved · 1 pending`.
5. Reload `gallery.html` → **Catering & Events** count is +1 and the photo is present with `data-id` starting `u`.
6. Back in admin, click **Unpublish** → pill returns to `Pending`, batch reads `2 pending`, gallery count back to original after reload.
7. Click **Reject** → pill `Rejected`; reload gallery → photo gone, but the thumbnail still renders in admin (the R2 object is retained, spec 6.3).
8. Click **Restore** → back to `Pending`.
9. Switch to **Orders** → order list untouched and working.

- [ ] **Step 7: Remove the test photos**

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler d1 execute la-creme-orders --remote --command="SELECT r2_key FROM upload_items" \
  | grep -oE 'img/[a-z0-9-]+/[a-f0-9-]+\.jpg' > /tmp/keys.txt
while read -r k; do npx wrangler r2 object delete "la-creme-media/$k" --remote; done < /tmp/keys.txt
npx wrangler d1 execute la-creme-orders --remote --command="DELETE FROM upload_items; DELETE FROM upload_batches; DELETE FROM upload_rate;"
rm -f /tmp/keys.txt /tmp/lc-test.jpg
npx wrangler r2 bucket info la-creme-media | grep object_count   # back to 334
```

- [ ] **Step 8: Commit**

```bash
cd "/c/xampp/htdocs/La creme"
git add admin.html admin.js
git commit -m "Add the Uploads section to the admin dashboard

Tabs for Orders / Uploads on the existing login — reuses api(), el() and
the session token rather than introducing a second auth path.

Batch list shows date, photo count, category, size and per-status tallies;
selecting one opens a thumbnail grid with Approve / Reject / Unpublish /
Restore / Retry per photo. Approving updates the manifest on the visitor's
next gallery load, with no code edit and no deploy.

All values are inserted via el() with textContent, never innerHTML —
filenames come from the owner's phone and are untrusted (admin.js:3)."
```

---

### Task 8: Telegram notifications

**Files:**
- Modify: `worker/index.js` (add `sendTelegram`, thread `ctx` through, two call sites)

**Interfaces:**
- Consumes: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` Worker secrets (both already set — `wrangler secret list` showed `TELEGRAM_BOT_TOKEN`, and you ran `secret put TELEGRAM_CHAT_ID` with `5541964557`).
- Produces: `sendTelegram(env: Env, text: string): Promise<void>` — resolves on success or failure, never rejects.

> **Two deviations from spec §8, both deliberate.**
>
> **1. `ctx.waitUntil` instead of a bare `await`.** Spec says notifications are "fire-and-forget". In a Cloudflare Worker, once your `fetch` handler returns its `Response`, any promise you started but did not hand to `ctx.waitUntil()` is cancelled — a plain un-awaited `fetch` to Telegram would silently never run. Awaiting it *inside* the handler would work but would hold every upload open for a Telegram round trip, so a Telegram outage would slow her uploads. `ctx.waitUntil()` gets both: the upload responds immediately, and Cloudflare keeps the Worker alive until the send finishes. This requires changing the handler signature from `fetch(request, env)` to `fetch(request, env, ctx)`.
>
> **2. No byte total in the message.** Spec's example reads `184 MB · awaiting your review`, but the notification fires on the *first* file of the batch — at that point exactly one photo is stored, so the only byte figure available would be ~300KB, not 184MB. Showing a confidently wrong number is worse than showing none, and the size is visible in the dashboard anyway. The message keeps the count, category, and the call to action.

- [ ] **Step 1: Verify both secrets exist**

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler secret list
```

Expected: both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` listed. If `TELEGRAM_CHAT_ID` is missing, add it now — it is not a credential, so typing it in plain is fine:

```bash
npx wrangler secret put TELEGRAM_CHAT_ID     # enter: 5541964557
```

- [ ] **Step 2: Add the sender**

Insert after `bumpBatch(...)` and **before** `handleUpload`:

```js
// Fire-and-forget. Never throws: a Telegram outage must not fail an
// upload (spec 8). Callers hand the returned promise to ctx.waitUntil()
// rather than awaiting it, so the upload responds without waiting on
// Telegram but Cloudflare still keeps the Worker alive until it lands.
async function sendTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
    if (!res.ok) console.error('telegram:', res.status, await res.text());
  } catch (err) {
    console.error('telegram:', err && err.message ? err.message : err);
  }
}
```

- [ ] **Step 3: Thread `ctx` through the handler chain**

**(a)** Change the exported handler's signature — `worker/index.js`, `export default {` →

```js
export default {
  // ctx is Cloudflare's execution context: ctx.waitUntil() is what lets
  // a notification keep running after this handler returns its Response.
  async fetch(request, env, ctx) {
```

**(b)** Pass it to `handleUpload` — change the route line to:

```js
      if (url.pathname === '/api/upload' && request.method === 'POST') return await handleUpload(request, env, ctx);
```

**(c)** Change `handleUpload`'s signature to match:

```js
async function handleUpload(request, env, ctx) {
```

**(d)** `handleGallery` and the other admin handlers stay `(env)` / `(request, env, id)` — they send no notifications and need no `ctx`.

- [ ] **Step 4: Wire the two notification points**

**(a) New batch.** In `handleUpload`, immediately **before** the `await bumpBatch(env, batch, 1, 0, bytes.byteLength);` line on the success path, add:

```js
  // First successful file in this batch -> one notification for the whole
  // upload, not one per photo (spec 8: "sent once per batch").
  if (batch.stored_count === 0 && batch.failed_count === 0) {
    ctx.waitUntil(sendTelegram(env,
      `🔔 New Gallery Upload\n` +
      `${batch.file_count} photo${batch.file_count === 1 ? '' : 's'} uploaded by the business owner.\n` +
      `Category: ${batch.category}\n` +
      `Awaiting your review`
    ));
  }
```

The gate is the *pre-update* counts: if files 1–3 all failed and file 4 is the first to store, `stored_count` is still 0 here, so the notification correctly still fires.

**(b) Failure.** In the `if (failure) { ... }` branch, immediately **after** `await bumpBatch(env, batch, 0, 1, 0);` and **before** the `return json(...)` line, add:

```js
    // Once per batch — a 23-file batch that fails 5 times must not buzz
    // the phone 5 times (spec 8).
    if (!batch.failure_notified) {
      await env.DB.prepare('UPDATE upload_batches SET failure_notified = 1 WHERE id = ?').bind(batch.id).run();
      ctx.waitUntil(sendTelegram(env,
        `⚠️ Upload Issue\n` +
        `${batch.failed_count + 1} of ${batch.file_count} photo${batch.file_count === 1 ? '' : 's'} failed to store (${batch.category}).\n` +
        `The file is still on her phone — ask her to retry.`
      ));
    }
```

`batch.failed_count + 1` is correct because `batch` is the row read *before* this failure was folded in.

- [ ] **Step 5: Deploy**

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler deploy
```

Expected: `Uploaded la-creme-orders`, no errors.

- [ ] **Step 6: Send a real push and watch it arrive**

```bash
W="https://la-creme-orders.lacreme.workers.dev"
cd "/c/xampp/htdocs/La creme"
node -e "require('fs').writeFileSync('/tmp/lc-test.jpg', Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64'))"
curl -s -o /tmp/n1 -w "upload: %{http_code}\n" -X POST "$W/api/upload" \
  -F "category=Wedding Cakes" -F "clientBatchId=tg$(date +%s)" -F "batchTotal=2" \
  -F "clientWidth=4" -F "clientHeight=3" -F "filename=tg1.jpg" \
  -F "file=@/tmp/lc-test.jpg;type=image/jpeg"
```

Expected **within ~2 seconds, on the phone running Telegram as `@Solarellik`**:

```
🔔 New Gallery Upload
2 photos uploaded by the business owner.
Category: Wedding Cakes
Awaiting your review
```

If nothing arrives: confirm the bot conversation is open (send any message to `@RellikBeatsBot` first — a bot cannot message you until you have started it), then check `npx wrangler tail` while re-running the upload to see a `telegram:` error line.

- [ ] **Step 7: Verify the Worker still answers without Telegram blocking**

```bash
time curl -s -o /dev/null -w "total: %{time_total}s\n" -X POST "$W/api/upload" \
  -F "category=Wedding Cakes" -F "clientBatchId=tg$(date +%s)" -F "batchTotal=1" \
  -F "clientWidth=4" -F "clientHeight=3" -F "filename=tg2.jpg" \
  -F "file=@/tmp/lc-test.jpg;type=image/jpeg"
```

Expected: `201` and `total:` comfortably under 1s. A total that tracks Telegram's latency would mean the call is being awaited rather than handed to `ctx.waitUntil()` — go back to Step 3.

- [ ] **Step 8: Clean up**

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler d1 execute la-creme-orders --remote --command="SELECT r2_key FROM upload_items" \
  | grep -oE 'img/[a-z0-9-]+/[a-f0-9-]+\.jpg' > /tmp/keys.txt
while read -r k; do npx wrangler r2 object delete "la-creme-media/$k" --remote; done < /tmp/keys.txt
npx wrangler d1 execute la-creme-orders --remote --command="DELETE FROM upload_items; DELETE FROM upload_batches; DELETE FROM upload_rate;"
rm -f /tmp/keys.txt /tmp/lc-test.jpg /tmp/n1
npx wrangler r2 bucket info la-creme-media | grep object_count   # back to 334
```

- [ ] **Step 9: Commit**

```bash
cd "/c/xampp/htdocs/La creme"
git add worker/index.js
git commit -m "Send Telegram notifications on new uploads and failures

Two messages, one per batch rather than one per photo: a 'New Gallery
Upload' on the batch's first successful file, and an 'Upload Issue' at
most once per batch when a file fails to store.

Handed to ctx.waitUntil() rather than awaited, so the upload responds
immediately and a Telegram outage cannot slow or fail it — Cloudflare
keeps the Worker alive until the send finishes either way. This requires
threading ctx through the fetch handler.

The message omits the byte total spec 8 shows: it fires on the first
file, when only ~300KB of a 184MB batch is stored, so any figure would
be wrong. Count, category and call to action are accurate.

Both Telegram sends are wrapped in try/catch and logged, never thrown."
```

---

### Task 9: End-to-end verification + mobile pass

**Files:**
- Create: *(none — this is verification; fix whatever it exposes)*
- Possibly modify: anything the checklist catches

**Interfaces:**
- Consumes: every task above, as a whole.
- Produces: a working pipeline you can hand to the business owner.

> **Do not commit the upload URL anywhere in this repo.** It is unlisted by design, and the page is the only thing standing between an open internet and your R2 quota (spec 11). Deliver it to her by message — WhatsApp, SMS, Signal — not by writing it into `README.md`, `config.js`, or a commit message.

- [ ] **Step 1: Pre-flight — confirm nothing sensitive is in the tree**

```bash
cd "/c/xampp/htdocs/La creme"
git status --short
echo "--- secrets scan (expect no hits) ---"
grep -rIn --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.wrangler \
  -E "8866900333|AAH0lGZz|TELEGRAM_BOT_TOKEN *=|ADMIN_PASSWORD *=" . || echo "  clean"
echo "--- upload page must not be linked from the site (expect no output) ---"
grep -n "upload\.html" index.html gallery.html admin.html index.js gallery.js admin.js 2>/dev/null || echo "  not linked"
echo "--- noindex present ---"
grep -c "noindex, nofollow" upload.html
```

Expected: clean working tree, `clean`, `not linked`, `1`.

If the working tree shows unexpected modifications, review them before proceeding — every completed task should already be committed.

- [ ] **Step 2: Confirm config points at the live Worker**

```bash
cd "/c/xampp/htdocs/La creme"
grep -n "ordersApi" config.js
```

Expected: `ordersApi: 'https://la-creme-orders.lacreme.workers.dev'` (Task 1). An empty string here silently disables the manifest merge, the admin page, and the upload page at once — it is the single most likely thing to have regressed.

- [ ] **Step 3: Full desktop end-to-end**

Serve the site and open two tabs — `http://localhost:8080/upload.html` and `http://localhost:8080/gallery.html` (plus `admin.html` in a third):

```bash
npx --yes serve -l 8080 "/c/xampp/htdocs/La creme"
```

1. **upload.html** — choose a category, pick 3 photos, Send. Progress advances, then `3 photos sent ✅`.
2. **Telegram** — one `🔔 New Gallery Upload` message arrives (not three).
3. **gallery.html** — reload. The photos are **absent** (they are `Pending`, and only `Approved` reaches the manifest). This is the gate working; do not skip this check.
4. **admin.html → Uploads** — one batch row, `3 pending`, correct size and timestamp. Open it, three thumbnails.
5. **Approve one** → pill `Approved`, batch reads `1 approved · 2 pending`.
6. **gallery.html reload** — that photo appears, `data-id` starts with `u`, its category tab count is +1.
7. **Reject one** → gone from the gallery, still visible in admin.
8. **Restore the rejected one to `Pending`** → still absent from the gallery.
9. **Category guard** — from the terminal:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://la-creme-orders.lacreme.workers.dev/api/upload" \
     -F "category=Cakes" -F "clientBatchId=guard$(date +%s)" -F "batchTotal=1" \
     -F "file=@/tmp/guard.jpg;type=image/jpeg"
   ```

   Expected `400`. (`'Cakes'` exists in the gallery data but is not a real tab — the Worker must refuse it.)

- [ ] **Step 4: Offline / API-down safety**

In DevTools with `gallery.html` open, set **Network → Offline** and reload. Expected: the full hardcoded gallery renders, no console errors, no broken images beyond the usual lazy-load behaviour. Kill nothing else — this is the guarantee that a Worker outage cannot take your site down (spec 9).

- [ ] **Step 5: Mobile pass**

The phone must reach your PC. Serve on all interfaces and use your machine's LAN IP:

```bash
npx --yes serve -l 0.0.0.0 "/c/xampp/htdocs/La creme"
ipconfig | grep -A3 "Wireless\|Ethernet" | grep "IPv4"     # note the address
```

Open `http://<your-ip>:8080/upload.html` on the phone.

| # | Check | Expected |
|---|---|---|
| 1 | Page loads | No errors; category dropdown has 9 options in gallery order |
| 2 | **Portrait photo via camera** | In admin, the thumbnail is **upright**, not rotated 90° — this is the EXIF fix (Task 5) and the single most likely thing to be wrong |
| 3 | Camera roll multi-select | 5+ photos → thumbnails appear with `Preparing…` then resolve |
| 4 | Send | Per-file progress advances; `5 photos sent ✅` |
| 5 | Telegram | **One** message, count `5`, correct category |
| 6 | Poor signal | Airplane mode mid-upload → a red retry message naming how many failed, never a silent drop |
| 7 | Recover | Re-enable network, tap **Retry** → the failed photos send and the batch reads correctly |
| 8 | Camera capture | `Take Photo` (not just the library) works |
| 9 | Large batch | 12 photos → one batch row, one Telegram, ~7MB total |
| 10 | Back button | Returning to the page does not resubmit; `againBtn` resets cleanly |

Every row must pass. Row 2 in particular is worth failing the whole pass on — she cannot rotate or re-tag a photo after upload (spec §13 excludes both).

- [ ] **Step 6: Clean the bucket and D1 for the last time**

```bash
cd "/c/xampp/htdocs/La creme/worker"
npx wrangler d1 execute la-creme-orders --remote --command="SELECT r2_key FROM upload_items" \
  | grep -oE 'img/[a-z0-9-]+/[a-f0-9-]+\.jpg' > /tmp/keys.txt
while read -r k; do npx wrangler r2 object delete "la-creme-media/$k" --remote; done < /tmp/keys.txt
npx wrangler d1 execute la-creme-orders --remote --command="DELETE FROM upload_items; DELETE FROM upload_batches; DELETE FROM upload_rate;"
rm -f /tmp/keys.txt /tmp/*.jpg 2>/dev/null
npx wrangler r2 bucket info la-creme-media | grep object_count
npx wrangler d1 execute la-creme-orders --remote --command="SELECT COUNT(*) AS n FROM upload_items"
```

Expected: `object_count: 334` — the value before any work began — and `n = 0`.

- [ ] **Step 7: Final commit**

```bash
cd "/c/xampp/htdocs/La creme"
git status --short
git log --oneline -9
```

Expected: clean tree, and one commit per task (Tasks 1-8). If anything is uncommitted, review and commit it now with a message describing what it actually changes.

- [ ] **Step 8: Hand off**

Tell the owner:

> The upload link is below — keep it to yourself, don't post it publicly. Open it, pick the category first, then choose your photos. You'll see a tick when they're sent, and I'll get a Telegram alert at the same moment. They go live in the gallery only after I approve them, so send whatever needs sorting.

Deliver `https://…/upload.html` over a private channel. **Not** in the repo, not in a commit, not in a public message.

---

## Self-Review

Run after writing; fix inline, do not re-review.

**1. Spec coverage** — every spec section maps to a task:

| Spec | Task |
|---|---|
| §4 category list, §4.3 server guard | 1, 3 (Step 6 test 2), 9 (Step 3 test 9) |
| §5 upload page, §5.1 resize, §5.2 one-at-a-time | 5 |
| §6.1 `POST /api/upload` | 3 |
| §6.2 `GET /api/gallery` | 4 |
| §6.3 admin endpoints | 4, 7 |
| §6.4 rate limiting + caps | 3 (Step 9) |
| §7 D1 tables, §7.1 state machine | 2, 3, 4 |
| §8 Telegram | 8 |
| §9 gallery merge | 6 |
| §10 admin dashboard | 7 |
| §12 build order phases 1-9 | Tasks 1-9 in order |
| §13 out of scope | respected — no video, no re-tagging, no deletion |
| §14 open items | all ticked; Task 9 enforces "unlisted" |

**Deliberate deviations, each documented where it occurs:**

- Status casing normalised to `Pending`/`Approved`/`Rejected`/`Failed` (spec §6.2/6.3 use lowercase `approved`, §7 uses capitals).
- `PATCH` accepts `Pending` in addition to `Approved`/`Rejected` — without it spec §6.3's "mis-click is recoverable" is untrue (Task 4).
- `GET /api/uploads/:id` added — spec §6.3's three routes would ship ~10k rows in one response (Task 4).
- Retry is re-verify, not re-write — the bytes are never retained server-side (Task 4).
- `MEDIA_CATEGORIES` ordered to match the **current** filter bar; spec §4.2's example array would have reordered live tabs (Task 1).
- EXIF orientation handled via `createImageBitmap` despite §13 excluding it — portrait photos would otherwise land rotated, with no post-upload fix available (Task 5).
- Byte total dropped from the Telegram message — unavailable at notification time (Task 8).
- `ctx.waitUntil` instead of a bare un-awaited `fetch`, which Cloudflare cancels (Task 8).

**2. Placeholder scan** — no `TBD`/`TODO`/`implement later`/`add error handling`/`similar to Task N`. Every code step carries a code block; every verification step carries the exact command and the expected output.

**3. Type consistency** — checked across tasks: `MEDIA_CATEGORIES` (`string[]`) appears as exactly two array literals (line 94 `config.js`, line 327 `worker/index.js`) and both are byte-identical in content **and order**; the three remaining mentions are prose listings of the same order. `clientBatchId` / `batchTotal` / `clientWidth` / `clientHeight` / `filename` / `file` / `category` — 7 names in `fd.append()` match 7 in `form.get()`. Status vocabulary: capitalized `Pending`/`Approved`/`Rejected`/`Failed` on the server (Tasks 2, 3, 4, 7); the 7 lowercase `'failed'` are all `upload.js`'s separate client-side entry status (`prep`/`ready`/`sent`/`failed`) and never cross the wire. Manifest item shape `{ id, category, image, aspect, iconKey, caption, sub }` produced by Task 4 matches what Task 6 spreads and what `makeTile` (`gallery.js:291`) consumes. `sendTelegram(env, text)` matches both call sites. `ensureBatch` still returns a batch object — Task 8 gates on pre-update counts instead of changing its signature. Task 5's new identifiers (`BATCH_TOTAL`, `newBatchId()`, `clearFailedMark()`, `entry.el`) are defined before use within `upload.js` and referenced only there.

**4. Behaviour pass** — three defects found in the draft and fixed inline rather than left for execution:

- **Retry was a no-op.** `sendAll` queued only `status === 'ready'`, but a failed entry is `'failed'` — so the "Retry N photos" button it printed would find an empty queue and do nothing. Queue now takes `ready || failed`.
- **Retry double-counted.** Re-sending into the same batch would add duplicate rows and push `stored_count + failed_count` past `file_count`, pinning `status` on `Partial` forever. A re-send now mints a new `clientBatchId`, keeping the failed history on the original row. Step 4 of Task 5 asserts exactly two rows and `items = 6` to catch a regression here.
- **`batchTotal` over-counted.** It included entries still resizing or already sent, so `file_count` could exceed what actually arrived and the batch could never reach `Complete`. Now captured once as `BATCH_TOTAL = queue.length`.

Also fixed: `markFailed` indexed `thumbs.children` by queue position, which diverges from the list as soon as any photo is skipped — entries now carry their own `li`.