# Invoice Workflow — Design Spec

**Date:** 2026-11-06
**Status:** Approved 2026-11-06
**Scope:** New subsystem — PDF invoice generation, Telegram delivery via Mekabot, and remote invoice correction.

---

## 1. Problem

Every order today ends as a WhatsApp text message. There is no formal document
the customer can keep, and no way for the sales rep to correct a price after the
order is placed without editing code or asking the site owner.

Goal: every order produces a PDF invoice that lands in company Telegram
automatically; the sales rep forwards it to the customer on WhatsApp; if the
order changes in chat, she corrects it from Telegram and the site re-issues the
invoice — with the admin panel tallying by construction.

## 2. Decisions

Settled during brainstorming; not reopened here.

| Decision | Choice | Rationale |
|---|---|---|
| Where the invoice is built | **Existing `la-creme-orders` worker** | No new service. The worker already receives every order and already talks to Telegram. |
| PDF renderer | **Hand-rolled, zero dependencies** | Workers cannot take native PDF libraries. A ~150-line renderer covers a header, a line table and a total. |
| Currency glyph in the PDF | **`NGN 38,000`, not `₦`** | Base PDF fonts have no naira glyph. Display-only; the site and WhatsApp keep `₦`. |
| Order text notification | **WhatsApp, unchanged** | The customer is followed up on WhatsApp; the existing `wa.me` handoff stays exactly as it is. |
| Invoice delivery | **Mekabot → company Telegram** | `wa.me` cannot attach files; the Cloud API would take the business number out of the normal app. Automation ends at company Telegram; the rep forwards to the customer. |
| Invoice recipients | **A separate, extensible chat list — not the upload-alert chat** | Upload alerts stay on the existing `TELEGRAM_CHAT_ID`. Invoices and bot commands go to `TELEGRAM_INVOICE_CHAT_IDS`, a comma-separated list so more sales reps can be added without a code change. |
| Bot | **Mekabot — the existing bot** | One bot, one token, one webhook. No second bot to manage. |
| Bot interaction | **Inline buttons, with a text command alternative** | Buttons for the common path; typed commands for anything the buttons don't cover. |
| Correction authority | **Bot-only endpoint, webhook-secret auth** | The rep never needs the admin password. The admin token stays for the dashboard. |
| Payment confirmation | **Manual — existing status PATCH** | Out of scope for this spec. |

## 3. Architecture

```
Customer places order
        │
        ├─► wa.me text message ──────────────► company WhatsApp   (unchanged)
        │
        └─► POST /api/orders ──► D1 orders row (lines_json)
                    │
                    └─► worker renders PDF
                              │
                              └─► Mekabot sendDocument ──► company Telegram
                                                          (every chat in
                                                           TELEGRAM_INVOICE_CHAT_IDS)
                                                              │
                                          rep downloads, forwards to customer
                                                              │
                                          order changes in chat?
                                                              │
                              company Telegram ──► Mekabot (buttons / text)
                                                              │
                                          POST /api/orders/:no/revise
                                                              │
                                          D1 updated ──► admin tallies
                                                              │
                                          worker re-renders PDF
                                                              │
                              Mekabot sendDocument ──► company Telegram
                                                              │
                                          rep forwards revised invoice
```

## 4. Data model

### 4.1 `orders` — two new columns

```sql
ALTER TABLE orders ADD COLUMN lines_json TEXT;      -- structured line items
ALTER TABLE orders ADD COLUMN revised INTEGER NOT NULL DEFAULT 0;
```

`lines_json` shape:

```json
[
  { "d": "Meat Pie",                 "q": 2, "p": 1000 },
  { "d": "Afang Soup, 5L, Goat",     "q": 1, "p": 30000 },
  { "d": "Birthday Cake — One Step", "q": 1, "p": null }
]
```

- `d` description, `q` quantity, `p` unit price in naira, or `null` for
  "price via WhatsApp" (cakes).
- Short keys keep the row small; the worker caps the array at 100 lines and
  the serialised string at 12,000 bytes (same ceiling as `items`).
- Old rows have `lines_json = NULL`. The invoice falls back to rendering the
  `items` text blob as unpriced lines, so historical orders still produce a
  document.

The existing `items` text blob is **kept and still written** — the admin list
and `printReceipt` render from it today, and nothing about them changes.

### 4.2 `bot_state` — new table

Workers are stateless between Telegram updates, so the conversation needs a
home.

```sql
CREATE TABLE IF NOT EXISTS bot_state (
  chat_id    TEXT PRIMARY KEY,
  step       TEXT NOT NULL,          -- 'awaiting_order_no' | 'awaiting_change'
  order_no   TEXT,
  updated_at TEXT NOT NULL
);
```

One row per chat. Cleared on completion, cancel, or a 15-minute timeout.

Because the key is `chat_id`, two sales reps correcting two different orders at
the same time never collide — each has their own conversation. Adding a rep is
adding their chat id to `TELEGRAM_INVOICE_CHAT_IDS`; no schema change.

## 5. PDF invoice

### 5.1 Renderer

A single function `renderInvoice(order)` in the worker returns a `Uint8Array`.
No dependencies. Contents:

- Header: **LA CRÈME**, tagline, invoice number, date issued.
- Customer block: name, phone, delivery method and address, date needed.
- Line table: description, qty, unit price, line total.
- Total row. Cakes show `Price via WhatsApp` in the price column and are
  excluded from the total, matching the cart's existing behaviour.
- Footer: "Thank you for choosing La Crème".
- A `REVISED v{revised + 1}` stamp when `revised > 0` (first correction = v2).

### 5.2 Layout is expected to change

The first generated invoice is a **starting point, not a final design**. The
owner will review it and request layout changes. The renderer is therefore
written as a small set of positioned primitives (text, rule, row) so a layout
change is a change to one function, not a rewrite.

### 5.3 Size

A one-page invoice is a few KB. Well inside Telegram's document limit and the
worker's memory ceiling.

## 6. Worker endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/orders` | public (existing) | Now also accepts and validates `lines` |
| `GET` | `/api/orders/:no/invoice` | admin token | Download the PDF |
| `POST` | `/api/orders/:no/revise` | webhook secret | Apply a correction, re-render, notify |
| `POST` | `/api/tg/<secret>` | path secret | Telegram webhook (Mekabot updates) |

`handleCreateOrder` gains validation for `lines`: must be an array, each entry
an object with a string `d`, a positive integer `q`, and `p` either a
non-negative number or `null`. Anything else is dropped rather than rejected —
a malformed line must never lose the order.

## 7. Mekabot (Telegram)

### 7.1 Webhook

`POST /api/tg/<TELEGRAM_WEBHOOK_SECRET>` — the path itself is the credential.
Registered once with `setWebhook`. The handler answers Telegram immediately and
does the work in `ctx.waitUntil`, so a slow D1 write never causes a retry storm.

### 7.1a Recipients

Two separate destinations, both served by the one Mekabot token:

| Destination | Secret | Receives |
|---|---|---|
| Upload alerts | `TELEGRAM_CHAT_ID` (existing) | Upload notifications — unchanged |
| Company Telegram | `TELEGRAM_INVOICE_CHAT_IDS` (new) | Invoices, order summaries, bot replies |

`TELEGRAM_INVOICE_CHAT_IDS` is a comma-separated list. Every invoice and every
bot reply is sent to **each** id in it. Adding a sales rep is appending their
chat id to the secret with `wrangler secret put` — no code change, no schema
change, and no redeploy (Workers pick up a re-set secret immediately).

The bot accepts commands from any chat in that list and ignores every other
chat, so a stranger who finds the bot cannot read or edit orders.

### 7.2 Commands and buttons

| Trigger | Button | Text alternative |
|---|---|---|
| Start a correction | **Edit invoice** | `/edit-invoice` |
| Look up an order | **View order** | `/view <order-no>` |
| Abandon | **Cancel** | `/cancel` |

### 7.3 Correction flow

```
rep taps Edit invoice  ──►  "Send the order number."
rep pastes 20261106-…  ──►  bot shows the current lines as a numbered list
                            with an inline keyboard of line numbers
rep taps a line        ──►  "Send the new unit price for line 2."
rep types 4500         ──►  bot confirms, applies, re-renders, sends the PDF
```

Text alternative for the whole flow, for when buttons are awkward:

| Input | Effect |
|---|---|
| `2 = 4500` | Set line 2's unit price to ₦4,500 |
| `+ 3 x Meat Pie @ 1000` | Add a line |
| `del 2` | Remove line 2 |

### 7.4 Failure replies

Every failure is an explicit message, never silence:

- Unknown order number → "No order with that number. Check and resend."
- Malformed change → "I couldn't read that. Try `2 = 4500`."
- Line out of range → "That order has 4 lines. Pick 1–4."
- Timeout → "Timed out. Tap Edit invoice to start again."

### 7.5 Idempotency

Telegram retries an update if the webhook doesn't answer quickly. Each update
is keyed by its `update_id`; a repeat is acknowledged and ignored, so one tap
never produces two revisions.

## 8. Admin

The order detail card gains an **Invoice** button next to *Print receipt*:

- Calls `GET /api/orders/:no/invoice` with the existing admin token.
- Downloads the PDF.
- `printReceipt` is untouched — it stays the till-style receipt.

The admin list and detail already render from `items`; they need no change for
INV-1. INV-2's corrections land in `lines_json` and `total`, both of which the
detail card already displays.

## 9. Security

- The webhook path secret is a new `wrangler secret`; it is not in the repo.
- `/api/orders/:no/revise` accepts **only** the webhook secret — the admin
  token cannot call it, and the webhook secret cannot call admin endpoints.
- The bot only acts on updates from a chat id in `TELEGRAM_INVOICE_CHAT_IDS`;
  any other chat is ignored, and the reply is a single "not authorised" line
  with no order data in it.
- `lines_json` is validated on write and re-validated on read before rendering,
  so a hand-edited row cannot inject into the PDF.
- The invoice endpoint is admin-only; there is no public invoice URL.

## 10. Build order

**INV-1 — PDF invoice on every order**
1. `lines` in both `logOrder` call sites (cake-only and combined checkout).
2. `lines_json` + `revised` columns; validation in `handleCreateOrder`.
3. `renderInvoice()`.
4. `sendDocument` helper; fire order text + PDF to every chat in
   `TELEGRAM_INVOICE_CHAT_IDS` on create. New secret; upload alerts keep
   using `TELEGRAM_CHAT_ID`.
5. Admin **Invoice** button.
6. Verify against `wrangler dev` — never production.

**INV-2 — `/edit-invoice`**
1. `bot_state` table.
2. Webhook endpoint + `setWebhook`.
3. Buttons and text commands.
4. `/api/orders/:no/revise` — apply, recompute total, bump `revised`.
5. Re-render and re-send.
6. Verify: happy path, bad order number, malformed change, double-submit.

**INV-3 — live prices via Telegram (deferred)**
`/adjust-price` moves menu prices from hardcoded `index.js` arrays into D1.
Deliberately last: it re-plumbs every price on the site. INV-1's `lines` are
shaped to read from that source when it arrives.

## 11. Out of scope

- Payment tracking (deposit/balance/paid). Status stays manual.
- WhatsApp Cloud API delivery.
- Customer-facing invoice links.
- Live price editing (INV-3).

## 12. Open items

- **Invoice layout** — the first render is a starting point; the owner will
  request changes after seeing it.
- **Initial chat ids** — `TELEGRAM_INVOICE_CHAT_IDS` starts with the current
  sales rep's chat id. Each rep gets their id added by messaging Mekabot once
  and reading the id from the webhook log, or by the owner forwarding it.
