# Project State — La Crème

**Updated:** 2026-11-19 (D0–D6 done; everything deployed)
**HEAD:** `4c1504f` · `invoice-revision` pushed, `main` fast-forwarded to the
same commit and live on Sonnet.

This is the only live memory file. Update it after each task.

---

## Where the work stands

Phases 0–6 (the customer's 14-item change list) and R1–R3.5 (PDF invoice,
pricing, bot) are **built, committed and deployed** — the live Worker is the
2026-11-19 build (`8681316e`), and the site on `main` is the same commit.

Work is now organised as a deployment plan, D0 → D6. **D0 was local; D1–D6
touch the remote and each needs explicit approval.**

| Phase | Scope | Status |
|---|---|---|
| **D0** | Close the audit holes: auth fails closed, order rate limit, per-device gate | **done** (`fb3048d`, `02e1219`) |
| D1 | Apply the three schema files to remote D1 | **done** 2026-11-18, verified |
| D2 | `setWebhook` onto the existing secret | **done** 2026-11-19, secret verified |
| D3 | Deploy the Worker | **done** 2026-11-19 (`8681316e`) |
| D4 | Ship the static site | **done** 2026-11-19 — `main` → Sonnet |
| D5 | One real end-to-end order | **done** 2026-11-19 (below) |
| D6 | Push the branch; merging to `main` is what ships D4 | **done** 2026-11-19 |

### D2, D3, D5 — done 2026-11-19

- **D2**: `setWebhook` reported "already set" to `.../api/tg/<secret>`; a
  POST probe returned 200 for the right secret and 404 for a wrong one, so
  the deployed secret matches.
- **D3**: `wrangler deploy` → version `8681316e`; `/api/prices` and
  `/api/gallery` return 200, `/api/orders` 401 unauthenticated.
- **D5**: order `20261119-120000101-TT` (Meat Pie x2, sent with a bogus
  `NGN 999,999` total) stored `price_status = priced`, and
  `invoice_versions` v1 holds `total = 2000` from the catalogue — the
  visitor's string was ignored. A second order (`...102-TT`) was replayed
  under `wrangler tail`: outcome `ok`, status 200, no logged errors.
  Delivery itself is the owner's to confirm; two PDFs should be in the
  owner chat.

### Daily report + instant order notifications — 2026-11-19

Both go to `TELEGRAM_CHAT_ID` (the owner's chat). The invoice recipients are
untouched: the PDF still goes to the staff roster plus
`TELEGRAM_INVOICE_CHAT_IDS` / `TELEGRAM_OWNER_CHAT_IDS`.

- **Instant notification**: every stored order posts one short message
  (number, name + phone, order type + the same total text the PDF caption
  uses) from `handleCreateOrder`, fire-and-forget beside the PDF send.
- **Daily report**: cron `0 23 * * *` = 00:00 Africa/Lagos (WAT is UTC+1, no
  DST) covers the **complete previous Lagos day**. Totals come from each
  order's latest `invoice_versions` row, so the report agrees with the PDF
  and the admin list, not with the visitor's typed string. Capped at 30
  lines with a `+N more` tail.
- `lagosDayWindow()` reads the boundary with a 2-minute forward bias, so a
  cron that fires slightly early still reports the day it was aimed at.
- **The 03:23 UTC retention sweep is unchanged** and still runs.
- `runScheduled(event, env, ctx)` dispatches on `event.cron`; an unknown
  cron falls through to the sweep, never to the report.
- `tools/test-cron.mjs` runs each schedule on its own and asserts the other
  one's work did not happen (report sends one message and never touches
  `upload_items`; sweep touches `upload_items` and sends nothing).

**Command renames**: `/edit-invoice` → `/editinvoice`, `/updateprice` for
the price command. The hyphen was never the fault — the reply went to the
wrong bot because the Worker's `TELEGRAM_BOT_TOKEN` held another bot's
token (see below) — but the owner wants one-word commands throughout.

**Token fix**: `TELEGRAM_BOT_TOKEN` was replaced with the `@Lacremeuyobot`
token (id `9049885698`) from `worker/.dev.vars`. The repo's own README had
told the operator to install "Mekabot"'s token, which is why replies landed
in an unrelated bot's chat. Not yet re-verified with a live reply.

### D0 — what it covers

- `fb3048d`: the per-device rate limit and the challenge gate below.
- `02e1219`: invoice totals sum from the lines actually stored, plus
  dead-code removal — the other half of the D0 audit fixes.
- `2fa8d31`: `admin.html` prints that same figure instead of the visitor's
 typed `total`, and reads "NGN 8,000 + 2 unpriced" when some lines still have
 no price — the gap stays visible instead of being rounded into a number.
- `0cd5955`: `isAuthed()` returns false when `SESSION_SECRET` is unset;
  `handleLogin()` returns 503 when `ADMIN_PASSWORD`/`SESSION_SECRET` are
  unset, before touching D1. Both used to fail **open**.
- Order endpoint rate-limited per device: **5 requests / 20 minutes**,
  counted in the existing `upload_rate` D1 table (Cloudflare’s Rate
  Limiting binding is pay-as-you-go only, so `[[ratelimits]]` is not
  available).
- Over the limit → `429 { requiresChallenge: true }` → full-screen
  scroll-locked gate on `index.html` with a WhatsApp fallback link, plus a
  Telegram alert on every refusal.
- Turnstile is fully configured: widget `la-creme-order-protection`, site
  key `0x4AAAAAAGG8LsW-btDaKwPe` at `index.js:1987`, and
  `TURNSTILE_SECRET` set on the Worker. The key pair is real and, since D3
  (2026-11-19), the deployed Worker verifies it — a challenged visitor can
  solve the challenge instead of being stuck on the gate.

### D1 — applied and verified 2026-11-18

`schema-pricing.sql` → `schema-invoice.sql` → `schema-bot.sql`, in that
order. The first two are `ALTER ... ADD COLUMN` and are **not re-runnable**:
a second run errors `duplicate column name`, which is expected and safe. A
*first*-run duplicate means partial application — stop and inspect.

Verified against the remote: `orders` has `price_status`, `spec_key`,
`lines_json`, `revised`; `settings` and `invoice_versions` exist with the
expected columns; `product_prices` = 34 rows. `settings` holds the owner's
real business details, so the DO NOT SEND band is gone.

### D4 — the site is Sonnet

`https://www.lacremeconfectionery.com` 301s to the apex, which is served by
**Sonnet** (confirmed from the live response headers), behind Cloudflare DNS.
Sonnet is git-connected to this repo, so D4 is not an upload: **production is
whatever Sonnet builds from `main`**, and `main` has none of this work. Pushing
`invoice-revision` gives a Sonnet preview URL to test against; merging to `main`
is what ships it, and that is a live deploy — same approval bar as D3.

### D6 landmine

`index.js` is **CRLF in both the blob and the working copy**. A normal
`git add` rewrites it to LF and produces a ~5,000-line diff. Stage it as
`git hash-object -w --no-filters index.js` then
`git update-index --cacheinfo 100644,<hash>,index.js`. `config.js` is the
opposite (LF blob, CRLF worktree); `worker/index.js` and `tools/*.mjs` are
LF throughout.

---

## Remote state — measured 2026-11-19

**Last code deploy: 2026-11-19** (`8681316e`). The live Worker now has the
PDF, the bot and Turnstile: `/api/prices` and `/api/gallery` return 200,
`/api/orders` 401 unauthenticated, and `/api/tg/<secret>` answers 200 for
the right secret and 404 for a wrong one.

**Remote D1 carries the invoice schema** (applied 2026-11-18): `orders`
(with `price_status`, `spec_key`, `lines_json`, `revised`), `login_attempts`,
`upload_batches`, `upload_items`, `upload_rate`, `bot_state`, `audit_log`,
`product_prices` (34 rows), `settings` (real business details) and
`invoice_versions`.

**Secrets set:** `ADMIN_PASSWORD`, `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `TELEGRAM_OWNER_CHAT_IDS` (`5541964557`),
`TELEGRAM_WEBHOOK_SECRET`, `TURNSTILE_SECRET`.
**Unset:** `TELEGRAM_INVOICE_CHAT_IDS` — the only secret still missing.
The webhook verifies against the secret now, so D2 is only `setWebhook`.
What is missing is deployment, not configuration — see D3.

**Never use `9049885698` as an invoice recipient** — that is
`@Lacremeuyobot` itself, and a bot cannot send a document to itself.

---

## Open questions for the user

1. **`TELEGRAM_INVOICE_CHAT_IDS`** — still unset. Invoices reach the owner
   through `TELEGRAM_OWNER_CHAT_IDS`; setting it adds the company/rep chat.

---

## Known defects, accepted for now

Audited 2026-11-11. The two that mattered are fixed in D0: auth no longer
fails open, and the invoice total is now summed from the lines actually
stored rather than from an array `serializeLines` may have trimmed. The rest
are live but low-consequence; none block D1–D3.

- Each order fans its PDF out to every invoice chat id (up to 20). The rate
  limiter throttles how often that can happen, but nothing caps the fan-out
  itself.
- `/api/upload` is open to the internet by design — 30 files/hour/IP, 2 MB
  each.
- `ensureBatch` can race on `client_batch_id` (UNIQUE), and
  `uploadRateLimited` is check-then-write, so a burst can slip past its cap.
- `hasPayment` turns true from `account_name` alone, so a PDF can print an
  empty payment block.
- `money()` is duplicated in `bot.js` and `invoice.js`; `handleListOrders`
  does `SELECT *` across 300 orders; `handleUpdateOrder` reports success for
  an order that does not exist; the body cap counts characters, not bytes.

---

## BUG-1 (deferred): mobile selector tap misfires

Reported 2026-11-06, **not diagnosed**. Tapping the size-plate/tray or
quantity selectors on mobile paints a faint blue rectangle slightly *below*
the tapped spot and selects nothing. Suspects: tap-highlight offset from the
real hit area, or a listener on a wrapper that the visual sits outside of.
Next step is an instrumented page on the owner's real device.

---

## Invariants

See `CLAUDE.md` — it is the authority on the money/ASCII/escaping rules,
the worker parity check, and the no-build constraint. The short version:
never trust a client-submitted price, never hardcode the WhatsApp number /
R2 base URL / naira formatting, escape everything into `innerHTML`, and
worker money is `NGN` never `₦`.
