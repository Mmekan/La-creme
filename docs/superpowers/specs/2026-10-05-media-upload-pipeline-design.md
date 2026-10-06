# Media Upload Pipeline — Design Spec

**Date:** 2026-10-05
**Status:** Awaiting approval
**Scope:** New subsystem — mobile photo intake, tagging, review, and publishing to the live gallery.

---

## 1. Problem

The business owner needs to send photos continuously. Today that means
WhatsApp or Drive by hand, and the site owner manually sorts them into gallery
categories and edits code to publish them.

Goal: she picks a category and uploads from her phone; the site owner is
notified, reviews, and publishes — with no code edits, no deploys, and no
manual file handling.

## 2. Decisions

These were settled during brainstorming and are not reopened here.

| Decision | Choice | Rationale |
|---|---|---|
| Staging layer | **None — upload direct to Worker** | Drive cannot push to a Worker (no webhook); detection requires polling on the free tier's limited cron. It adds OAuth plumbing and a second copy to guard. The Worker already sits between the page and R2. |
| Publishing gate | **Review, then approve** | Nothing unvetted reaches the live gallery. |
| Upload page auth | **None — unlisted URL only** | The owner is the only holder of the link and the site owner approves every item, so nothing reaches the gallery unvetted. |
| Image handling | **Resize client-side on her phone** | A 23-photo batch goes up in seconds, not minutes on mobile data. Keeps the Worker request well under its size ceiling. |
| Category list | **Matches the gallery filter bar** | One shared constant; cannot drift. |
| Gallery publishing | **Worker serves a manifest; `gallery.js` fetches it** | Approve in admin → live. No paste, no commit, no deploy. |
| Notifications | **Telegram bot only** | WhatsApp ping dropped — Telegram covers it with less friction. |

### Dropped from the original brief

- **Google Drive staging.** Replaced by direct-to-Worker. The reliability
  requirement is still met, and more strongly: R2 *is* the store, so there is
  no temporary copy that could be lost. Nothing is ever deleted before it is
  confirmed present.
- **The separate "Upload Complete" notification.** It existed only because
  Drive made processing a distinct async phase. Without Drive, the upload *is*
  the processing.

---

## 3. Architecture

```
Owner (mobile)                Worker (la-creme-orders)              Cloudflare
──────────────                ──────────────────────              ─────────
upload.html  (unlisted URL)
  ├─ category ──────────────►  POST /api/upload
  ├─ pick photos                ├─ IP rate-limit check
  ├─ resize on device           ├─ validate category
  ├─ upload one at a time       ├─ R2 PUT  img/<category-slug>/<id>.jpg
  └─ with progress              ├─ R2 HEAD read-back  ← verify
                                ├─ INSERT D1 row (pending)
                                └─ Telegram: new batch

gallery.html ───────────────►  GET /api/gallery  ──────────────►  reads D1
  └─ merges into grid           (approved only)                    (public)

admin.html
  └─ Approve / Reject ───────►  PATCH /api/uploads/:id
                                └─ status → approved  (now in manifest)
```

**Safety order.** Every upload is `R2 PUT → R2 HEAD read-back → D1 INSERT`.
D1 never records a file that R2 did not confirm. There is no delete in the
happy path.

---

## 4. Category list (single source of truth)

### 4.1 The problem being fixed

`CAKE_FILTER_CATEGORIES` lives in `gallery-data.js:31` and `filterCategories`
in `gallery.js:176`. They have already drifted: 23 items use the category
`'Cakes'`, which appears in **no** filter tab, so they are reachable only via
"All".

### 4.2 The change

Add `MEDIA_CATEGORIES` to `config.js` (already loaded by every page):

```js
const MEDIA_CATEGORIES = [
  'Wedding Cakes',
  'Traditional Wedding Cakes',
  'Anniversary',
  'Cakes for Boys',
  'Cakes for Girls',
  'Cakes for Men',
  'Cakes for Women',
  'Catering & Events',
  'Small Chops',
];
```

Consumers:

- `gallery.js:176` → `const filterCategories = ['All', ...MEDIA_CATEGORIES];`
- `index.js:339-340` (cake modal) → `['All', ...MEDIA_CATEGORIES]`
- `upload.js` (new) → the dropdown, rendered from the same array

`CAKE_FILTER_CATEGORIES` in `gallery-data.js` is removed once both consumers
read the new constant. Per-briefing, the 23 orphaned `'Cakes'` items are
**left untouched** — they remain reachable via "All". Because the owner cannot
upload without selecting a category, and the dropdown offers only real filter
tabs, no new orphans can be created.

### 4.3 Server-side guard

`POST /api/upload` validates the category against `MEDIA_CATEGORIES` and
rejects anything else with `400`. The dropdown is a convenience, not the
enforcement point.

---

## 5. Upload page (new: `upload.html`, `upload.js`)

Mobile-first. Three steps, one tap each, all controls thumb-sized.

1. **Category** — one dropdown, required. Asked *before* file selection so the
   tag is bound to everything that follows.
2. **Photos** — large target opening camera roll or camera. `multiple`,
   `accept="image/*"`. Thumbnails render as they are chosen.
3. **Done** — "12 photos sent ✅".

No login, no PIN, no account. The page is reached by its unlisted URL only.

### 5.1 Client-side resize

On-device via canvas, before upload:

- Long edge → 2400px (aspect preserved)
- Re-encode JPEG, quality ~0.82
- Target ≈ 300KB per photo

Rationale: a 23-photo batch drops from ~150MB to ~7MB. On mobile data this is
the difference between seconds and minutes, and it keeps the Worker request
far below its body-size ceiling.

### 5.2 Upload mechanics

**One file at a time, with a per-file progress bar** — not a single batch
request. If a connection drops on photo 14 of 23, only photo 14 retries.

Each upload is `multipart/form-data` with:

| Field | Value |
|---|---|
| `category` | one of `MEDIA_CATEGORIES` |
| `file` | the JPEG blob |
| `clientWidth` / `clientHeight` | post-resize dimensions, for aspect ratio |

Failed files are retried up to 3 times with backoff, then marked failed and
reported to the owner — **never silently dropped**.

---

## 6. Worker endpoints

All on the existing `la-creme-orders` Worker, sharing its CORS helper and
`json()` responder.

### 6.1 `POST /api/upload` — public, unlisted-URL access

Multipart. IP rate-limit check → validates category → `R2 PUT` → `R2 HEAD`
read-back → `INSERT` D1 → returns `201` with `{ id, r2Key, imageUrl }`.

`imageUrl` uses the existing `R2_BASE_URL` so the admin dashboard can render a
thumbnail immediately.

### 6.2 `GET /api/gallery` — public, unauthenticated

Returns only `status = 'approved'` items. Consumed by `gallery.js`. Cacheable
(`Cache-Control: public, max-age=60`).

### 6.3 Admin endpoints — Bearer token, existing `isAuthed()`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/uploads` | Batch history for the dashboard |
| `PATCH` | `/api/uploads/:id` | `{ status }` → `approved` or `rejected` |
| `POST` | `/api/uploads/:id/retry` | Re-attempt a failed R2 write |

Approving sets `status = 'approved'` and `approved_at`. **The R2 object is not
moved or renamed** — the file is written once to its final key at upload time.
Approval only changes a database flag, which is what makes it instant.

Rejecting hides the item from the manifest. The R2 object is retained (not
deleted) so a mis-click is recoverable; a separate cleanup is out of scope.

### 6.4 Auth model

**Owner upload: none.** `POST /api/upload` is unauthenticated and protected
only by the URL being unlisted. She never sees a login, a code, or an account.

The exposure this leaves is **quota and storage, not the gallery** — an
unknown caller could upload junk files, but nothing reaches the live site
without explicit approval in `admin.html`. The mitigation is therefore
rate limiting rather than authentication:

- **Per-IP rate limit on uploads** — 30 files per hour and 20 distinct hours
  per day per IP, tracked in a new `upload_rate` table. Mirrors the existing
  `login_attempts` pattern (time-windowed rows keyed by IP), so it is a small
  addition using an approach already in the codebase.
- **Per-request body cap** — rejects anything over ~2MB, well above the
  ~300KB post-resize target, so a single call cannot push a large payload.
- **Total batch cap** — a batch may not exceed 200 files.

Exceeding a limit returns `429` with a plain message; her page shows a
friendly "Too many uploads right now — try again later" rather than an error.

**Owner admin:** reuses the existing `ADMIN_PASSWORD` / `SESSION_SECRET` /
`isAuthed()` flow unchanged. No new auth system. This is the boundary that
actually matters — it is what gates publishing.

---

## 7. Data (new D1 tables)

Applied via a new `schema-media.sql`, mirroring `schema.sql` conventions.

```sql
CREATE TABLE IF NOT EXISTS upload_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  category TEXT NOT NULL,
  file_count INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
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

-- Rate limiting for the unauthenticated upload endpoint (§6.4).
-- Time-windowed rows keyed by IP, mirroring the existing login_attempts
-- pattern. Old rows are pruned on each write.
CREATE TABLE IF NOT EXISTS upload_rate (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_ip ON upload_rate(ip, ts);
```

`image_url` is denormalised so the dashboard and manifest need no join and no
`R2_BASE_URL` knowledge.

### 7.1 State machine

```
                 upload succeeds
   (none) ──────────────────────────► Pending
                                        │
                        ┌───────────────┴───────────────┐
                    approve                          reject
                        │                               │
                        ▼                               ▼
                    Approved                        Rejected
                (in gallery manifest)         (hidden; R2 retained)

   upload/verify fails ──► Failed ──► (retry) ──► Pending
```

Per the briefing, there is no separate *Processing* or *Uploaded to R2* state:
the Worker writes and verifies during the upload request, so a `Pending` item
is already durably in R2. The only states the owner can act on are **Pending
→ Approved**.

---

## 8. Notifications (Telegram)

**Confirmed values:**

| Item | Value |
|---|---|
| Bot | **@RellikBeatsBot** (display name "MmekaBot") |
| Chat ID | **5541964557** (`@Solarellik`, "SolaRellik") |
| R2 bucket | **`la-creme-media`** |
| Secrets | `TELEGRAM_BOT_TOKEN` ✅ set · `TELEGRAM_CHAT_ID` ⬜ **still needed** |

`TELEGRAM_BOT_TOKEN` is already stored via `npx wrangler secret put`. The
token pasted into chat during planning was revoked and replaced; the live
value now exists only in Cloudflare's encrypted store and is never written to
the repo or to any file the agent can read.

`TELEGRAM_CHAT_ID` is not a credential, so it can be added the same way:

```
npx wrangler secret put TELEGRAM_CHAT_ID     # value: 5541964557
```

Sent fire-and-forget from the Worker via `fetch` to `api.telegram.org` — a
Telegram failure must never fail an upload. Wrapped in try/catch, logged, and
ignored.

**On first successful upload of a batch:**

```
🔔 New Gallery Upload
12 photos uploaded by the business owner.
Category: Wedding Cakes
184 MB · awaiting your review
```

**On a failed item:**

```
⚠️ Upload Issue
1 of 12 photos failed to store (Wedding Cakes).
The file is still on her phone — ask her to retry.
```

Sent once per batch, not per file, to avoid a phone buzzing 23 times.

---

## 9. Gallery integration (`gallery.js`)

On `DOMContentLoaded`, before first render:

```
GET {ordersApi}/api/gallery
  ├─ success → merge into galleryItems, then render
  └─ failure/timeout/offline → render hardcoded GALLERY_ITEMS alone
```

- Deduped by `id`.
- IDs are namespaced (`u{id}`) so they cannot collide with the hardcoded
  numeric IDs in `GALLERY_ITEMS`.
- `aspect` computed as `width / height` from the values the client reported
  at upload — no manual data entry.
- `iconKey` defaults to `'cake'`, resolved against the page's existing `ICONS`
  map exactly as static items are.
- **Timeout ~3s.** A slow or unreachable API must not delay the gallery;
  hardcoded content renders immediately and the fetch only ever adds to it.
- 3-second client-side cache to avoid refetching on every navigation.

The hardcoded `GALLERY_ITEMS` array remains in `gallery-data.js` as the
offline fallback. The site behaves exactly as it does today if the Worker is
completely unreachable.

---

## 10. Admin dashboard (`admin.html` + `admin.js`)

A new "Uploads" section alongside the existing orders view. Reuses the
current login, token handling (`sessionStorage`, `Bearer`), and the `el()`
DOM-builder — no new UI framework.

**Batch list** — the table from the briefing:

| Date | Files | Size | Status |
|---|---|---|---|
| Oct 5, 2:30 PM | 12 | 184 MB | 🟢 7 approved · 5 pending |

**Batch detail** — thumbnail grid. Each item: preview, filename, size,
dimensions, status. Actions:

- **Approve** → `PATCH`, thumbnail moves to the approved group. **The gallery
  is updated on her next device load** — nothing to deploy.
- **Reject** → `PATCH`, hidden from the manifest.
- **Retry** (failed items only) → re-attempts the R2 write.

All DOM built with `el()` and `textContent`, never `innerHTML` — matching the
existing XSS-safe pattern documented at `admin.js:3`.

---

## 11. Security notes

Stated plainly, because the upload endpoint has no authentication by decision:

- **`POST /api/upload` is open to anyone who has the URL.** The protection is
  the URL being unlisted. If it is ever posted publicly, shared in a group
  chat, or indexed, anyone can upload files to the bucket. Keeping it
  unlisted is doing real work here and is the single most important
  operational habit — see §14.
- **The blast radius of abuse is storage and quota, not the gallery.** Junk
  uploads sit in R2 costing storage and Worker requests; they are invisible on
  the site and removable in `admin.html`. The per-IP limits in §6.4 bound
  this. Approving is the real gate, and it stays password-protected.
- **Rejected and unapproved files still occupy R2 storage.** A spammer who
  respects the rate limit can still accumulate data. If storage cost ever
  becomes a concern, a cleanup job deleting `rejected`/`failed` items older
  than 30 days is the fix — deliberately out of scope for now.
- R2 objects under `img/` are **publicly readable by URL**, exactly as
  every current gallery image is. Uploading does not make anything private.
  If private media is ever needed, that is a signed-URL change, out of scope
  here.
- The client reports `width`/`height`. These are only used for masonry layout;
  they are not security-relevant and are not trusted for anything else.
- The bot token is a live credential. It is never written to the repo, and
  the token pasted into chat during planning has been revoked.

---

## 12. Build order

Each phase is independently verifiable in the browser.

1. **`MEDIA_CATEGORIES`** in `config.js`; repoint `gallery.js` and `index.js`;
   remove `CAKE_FILTER_CATEGORIES`. Verify the gallery filter bar is unchanged.
2. **`schema-media.sql`** — create both tables, apply to remote D1.
3. **Worker** — `POST /api/upload` + IP rate limiting + R2 write/verify.
   Testable with `curl` before any UI exists.
4. **Worker** — `GET /api/gallery` + admin endpoints. Testable with `curl`.
5. **`upload.html` / `upload.js`** — dropdown, resize, one-at-a-time upload
   with progress. No login step.
6. **`gallery.js`** manifest merge. Verify: upload a test image, approve it,
   see it live.
7. **`admin.html` / `admin.js`** — Uploads section.
8. **Telegram** — secrets + send. Verify a real push arrives.
9. **Mobile pass** — test on a real phone: camera roll, camera, several files,
   poor signal, and a mid-batch failure.

Phases 1–4 are backend-only and can ship before the owner sees anything.

---

## 13. Out of scope

- Video upload (gallery supports it; pipeline is images only for now).
- Automatic EXIF rotation and thumbnail generation.
- Re-categorising an existing item after approval.
- Deleting rejected files from R2 (retained deliberately).
- Any change to the existing orders flow, auth, or D1 tables.

---

## 14. Open items

- [x] Telegram chat ID — `5541964557` (`@Solarellik`).
- [x] R2 bucket name — `la-creme-media`.
- [x] `upload.html` stays **unlisted**. No link, button, or nav entry from
      `index.html` or `gallery.html` — the URL is shared by message only.
      Since the upload endpoint is unauthenticated, this is the layer that
      matters; a stray nav link would expose it publicly and to search
      engines.
- [x] **Bucket confirmed: `la-creme-media` is the bucket behind
      `R2_BASE_URL`.** Verified three ways — `wrangler r2 bucket dev-url get`
      maps it to `pub-a9f72716…r2.dev`, a real gallery image fetched from
      the bucket is 75,062 bytes matching the live URL's `Content-Length`
      exactly, and the live URL returns 200 for `img/` and `img/offload/`
      paths. Bucket layout is `img/`, `img/offload/`, `videos/` — keys are
      flat prefixes, not real folders.
- [ ] Add `TELEGRAM_CHAT_ID` as a Worker secret (§8).
- [ ] Add the R2 binding to `worker/wrangler.toml`:

  ```toml
  [[r2_buckets]]
  binding = "MEDIA"
  bucket_name = "la-creme-media"
  ```

  The bucket already exists (334 objects, 538 MB) — no `r2 bucket create`
  needed.

> **Gotcha for build/testing:** `wrangler r2 object put`/`get` write to a
> **local miniflare cache** by default and silently ignore the real bucket.
> Always pass `--remote` when probing the live bucket, or you will conclude
> an object is missing when it isn't (and vice versa). `wrangler r2 bucket
> info` is always remote.
