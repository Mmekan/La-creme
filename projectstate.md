# Project State — La Crème

**Updated:** 2026-11-16 (D0 pre-deploy hardening in progress)
**HEAD:** `fb3048d` · branch `invoice-revision`, **18 commits ahead of
`origin/invoice-revision`, unpushed** · `main` untouched and behind.

This is the only live memory file. Update it after each task.

---

## Where the work stands

Phases 0–6 (the customer's 14-item change list) and R1–R3.5 (PDF invoice,
pricing, bot) are **built and committed**. Nothing is deployed: the live
Worker is the 2026-10-09 build and predates all of it.

Work is now organised as a deployment plan, D0 → D6. **D0 is local; D1–D6
touch the remote and each needs explicit approval.**

| Phase | Scope | Status |
|---|---|---|
| **D0** | Close the audit holes: auth fails closed, order rate limit, per-device gate | **in progress** |
| D1 | Apply the three schema files to remote D1 | not started |
| D2 | Telegram webhook secret + `setWebhook` | not started |
| D3 | Deploy the Worker | not started |
| D4 | Upload the static site | blocked — host unknown |
| D5 | One real end-to-end order | not started |
| D6 | Push the branch | not started |

### D0 — what it covers

- `0cd5955`: `isAuthed()` returns false when `SESSION_SECRET` is unset;
  `handleLogin()` returns 503 when `ADMIN_PASSWORD`/`SESSION_SECRET` are
  unset, before touching D1. Both used to fail **open**.
- Order endpoint rate-limited per device: **5 requests / 20 minutes**,
  counted in the existing `upload_rate` D1 table (Cloudflare's Rate Limiting
  binding is pay-as-you-go only, so `[[ratelimits]]` is not available).
- Over the limit → `429 { requiresChallenge: true }` → full-screen
  scroll-locked gate on `index.html` with a WhatsApp fallback link, plus a
  Telegram alert on every refusal.
- **Turnstile is scaffolded but cannot pass yet**: `TURNSTILE_SITE_KEY` is a
  placeholder and no `TURNSTILE_SECRET` is set, so `verifyTurnstile()`
  always returns false. A challenged visitor is stuck on the gate until a
  real key pair exists — the WhatsApp link is their only way through.
  **This is a D2/D3 prerequisite for D5.**

### D1 traps

`schema-pricing.sql` → `schema-invoice.sql` → `schema-bot.sql`, in that
order. The first two are `ALTER ... ADD COLUMN` and are **not re-runnable**:
a second run errors `duplicate column name`, which is expected and safe. A
*first*-run duplicate means partial application — stop and inspect.

Verify after: `PRAGMA table_info(orders)` shows `price_status`, `spec_key`,
`lines_json`, `revised`; `settings` and `invoice_versions` exist;
`SELECT COUNT(*) FROM product_prices` = 34.

### D6 landmine

`index.js` is **CRLF in both the blob and the working copy**. A normal
`git add` rewrites it to LF and produces a ~5,000-line diff. Stage it as
`git hash-object -w --no-filters index.js` then
`git update-index --cacheinfo 100644,<hash>,index.js`. `config.js` is the
opposite (LF blob, CRLF worktree); `worker/index.js` and `tools/*.mjs` are
LF throughout.

---

## Remote state — measured 2026-11-16

**Last code deploy: 2026-10-09 11:41 UTC.** The live Worker has no PDF, no
bot, and `/api/prices` returns 401.

**Remote D1 is un-migrated for the invoice work.** Present: `orders`,
`login_attempts`, `upload_batches`, `upload_items`, `upload_rate`,
`bot_state`, `audit_log`, `product_prices` (34 rows). Missing: `settings`,
`invoice_versions`, and the four `orders` columns — see D1.

**Secrets set:** `ADMIN_PASSWORD`, `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `TELEGRAM_OWNER_CHAT_IDS` (`5541964557`).
**Unset:** `TELEGRAM_INVOICE_CHAT_IDS`, `TELEGRAM_WEBHOOK_SECRET`.
`handleTelegramWebhook` returns 404 for every request while the webhook
secret is unset, so the bot is entirely dead without it.

**Never use `9049885698` as an invoice recipient** — that is
`@Lacremebotuyo` itself, and a bot cannot send a document to itself.

---

## Open questions for the user

1. **Where is the static site hosted?** (Netlify Drop / GitHub Pages /
   something else / local only) — blocks D4.
2. **`TELEGRAM_INVOICE_CHAT_IDS`** — the owner's personal chat, or a
   company/rep chat id? Blocks D2.
3. **Go-ahead for D1 and D3** — both write to the remote.
4. **BUG-2's four values** — see below.

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

## BUG-2 (blocked on owner): business details are not configured

The real bank name, account number, phone and address are missing from D1,
so **every** invoice — Telegram copy and admin download alike — carries the
red `BUSINESS DETAILS NOT CONFIGURED - DO NOT SEND TO CUSTOMER` band. That
is the intended fail-safe, not a defect: no placeholder bank details can
reach a customer.

They go into the D1 `settings` table (keys in `SETTING_KEYS`,
`worker/invoice.js`) once the owner supplies them. **Every status report
names BUG-2 until it is resolved.**

---

## Invariants

See `CLAUDE.md` — it is the authority on the money/ASCII/escaping rules,
the worker parity check, and the no-build constraint. The short version:
never trust a client-submitted price, never hardcode the WhatsApp number /
R2 base URL / naira formatting, escape everything into `innerHTML`, and
worker money is `NGN` never `₦`.
