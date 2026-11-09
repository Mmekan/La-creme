# Invoice Revision — Design Spec (R1–R3)

**Date:** 2026-11-09
**Status:** Approved by the owner 2026-11-09
**Supersedes (layout only):** `2026-11-06-invoice-workflow-design.md` §5, §7.2, §10
**Scope:** PDF layout rework, live catalogue pricing in D1, `/update-price`, order-specific pricing, approval gate, invoice version history.

---

## 1. Problem

INV-1 shipped a structurally correct invoice that no human has judged. The owner
has now specified what a finished invoice must contain and, separately, how
pricing must work end to end:

- The invoice is missing everything a customer keeps: logo, company contact,
  bank details, a proper conclusion.
- It truncates long descriptions and addresses instead of wrapping.
- It has no visual identity (all black Helvetica).
- Cakes are unpriced, and there is **no path** for the operator to price them
  without editing code.
- Menu prices are hardcoded in `index.js`, so production-cost increases need a
  deploy.

## 2. Owner's requirements (verbatim intent, condensed)

### 2.1 Invoice content

Only what a professional invoice needs:

- Company logo and name
- Company phone and physical address
- Customer information
- Invoice number and issue date
- Product descriptions, quantities, individual prices
- Order total
- Payment details: bank name, account name, account number
- A short conclusion

Avoid unnecessary or decorative text.

### 2.2 Brand

Gold and red, **red dominant**, gold as accent. Professional, clean, readable.
Avoid excessive colour.

Reference palette (from `_image-review.html`, to be confirmed by the owner):

| Token | Value |
|---|---|
| Red | `#C8102E` |
| Gold | `#C7A155` |

### 2.3 Dates

`07 Nov 2026` everywhere — issue date, delivery date, revision timestamps.

### 2.4 Layout

- Never truncate. Wrap onto the next line; row height expands.
- Compact and aligned. No overlap with quantities, prices, other columns, footer.
- Multipage: preserve table structure, repeat column headings.

### 2.5 Currency and characters

- `NGN`, never `₦`. e.g. `NGN 5,000`.
- Avoid em dashes; use colons and ordinary punctuation.
- **All characters must render** — no `?` substitutions.

### 2.6 Layout order

1. Company and invoice information
2. Customer and delivery information
3. Itemised product list
4. **Order total**
5. Payment details — left-aligned, **logo to the right beside it**
6. Conclusion — bottom, centred, capital letters

Total must appear **before** payment details.

### 2.7 Pricing workflow

- Items without a price are still recorded and still notify the company.
- Such an invoice is **pending internal price review**; it is not a final
  invoice until the price is confirmed.
- The operator receives order + invoice in Telegram, reviews, and prices it.
- Two **separate** operations:
  - **Order-specific price** — this order only, catalogue unchanged.
  - **Global catalogue price** — permanent, reflects on the website immediately.
- After pricing, the invoice is regenerated with correct descriptions,
  quantities, prices and total.
- Operator reviews and approves before it goes to the customer.
- If the site already knows the price, **no review step** — the order flows
  straight through.
- When an item has no price, the **site** tells that customer the price will be
  finalised on WhatsApp.
- A repeat cake reuses a price only when it is the **exact same specification**
  as a previously priced one. Custom builds never auto-price.

### 2.8 Revised invoices

- `REVISED: V2` — prominent, **near the invoice number**, not a small line under
  the date.
- Preserve previous versions for record-keeping.
- Each revision gets its own version number and timestamp.
- State clearly that the revised invoice replaces the previous version.
- Keep a record of what changed where practical.
- **The customer only ever sees the latest version.**

## 3. Decisions settled in conversation

| Question | Decision |
|---|---|
| Live prices: JSON file or D1? | **D1.** A Worker cannot write a repo file; JSON gives neither immediacy nor security. Server stays authoritative. |
| Cake match key | `tiers + tierDetails(inches/layers) + flavour + finish`, normalised. **Occasion excluded.** Custom and Wedding always bypass matching. |
| Inches/layers in the key | **Yes — included.** Different sizes are different items. |
| Conclusion text | `THANK YOU FOR CHOOSING LA'CREME!` |
| Logo format | JPEG is acceptable "as long as it's clean". |
| Logo asset | **`img/logo-crest.jpg`** — same artwork as `img/logo.jpg` but tightly cropped (302×216 vs 2100×1500 with wide white margins), 16 KB vs 210 KB. Baseline JPEG, embeds via `DCTDecode` with no decoding. |
| Customer version visibility | **Latest only.** History is internal. |
| Approval scope | Only orders that were pending price. Fully-priced orders skip review. |
| Operators | Both company Telegram and the owner receive orders and invoices. See §4. |
| Company price writes | A price set during review is **remembered on the site**, so the next customer ordering the same spec is auto-priced. |
| Owner scope | Can change anything at any time, not only during a review. |

## 4. Roles

Two allowlists, both served by the one Mekabot token. **Both receive every order
and every invoice** — notifications are not split.

| Secret | Who | Can do |
|---|---|---|
| `TELEGRAM_INVOICE_CHAT_IDS` | Company Telegram (operator). Interim: owner only. | Receive orders + invoices; review a pending invoice; set its price (**remembered on the site**); approve; re-download |
| `TELEGRAM_OWNER_CHAT_IDS` | Owner, direct DM | Everything above, **plus** `/update-price` — change any catalogue price at any time, outside a review |

The owner chat is a superset. A chat in neither list is ignored with a single
"not authorised" line carrying no order data.

**The distinction is scope, not seniority.** Company prices an order it is
looking at, and that price sticks for future identical orders. The owner can
additionally change any price whenever they like, without an order in hand.

Interim behaviour (no company number yet): only `TELEGRAM_INVOICE_CHAT_IDS` is
set and contains the owner's id. Every flow works. Adding the company number
later is `wrangler secret put` — no code change, no redeploy.

### 4.1 Remember-vs-quote

A price set during review is written to `product_prices` **and** to the order's
line, so ordering it again auto-prices. A genuine one-off quotation still needs
an escape hatch, so the review flow offers both:

- **Save price** (default, primary button) — order line + catalogue.
- **This order only** — order line only, catalogue untouched.

Without the second, a single special quote would silently become the standing
price for that spec. Custom and Wedding cakes bypass matching regardless.

## 5. Data model

### 5.1 `orders` — new columns

```sql
ALTER TABLE orders ADD COLUMN price_status TEXT NOT NULL DEFAULT 'priced';
-- 'pending' | 'priced' | 'approved'
ALTER TABLE orders ADD COLUMN spec_key TEXT;   -- cake match key, NULL for non-cake
```

`price_status` defaults to `'priced'` so historical rows and fully-priced orders
need no backfill. `pending` is written at insert when any line has `p === null`.

`revised` (INTEGER) stays as the version counter — first revision is v2.

### 5.2 `settings` — business information

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Seeded keys: `company_phone`, `company_address`, `bank_name`, `account_name`,
`account_number`, `logo_updated_at`.

Values arrive from the owner later. **An empty or missing value omits that line
from the PDF** rather than printing a blank label — so the invoice is shippable
today and gets richer as values land, with no code change.

### 5.3 `product_prices` — live catalogue

```sql
CREATE TABLE IF NOT EXISTS product_prices (
  item_key   TEXT PRIMARY KEY,   -- 'afang:5L', 'sc-plate-standard', 'cake:<spec_key>'
  category   TEXT NOT NULL,      -- 'soups' | 'rice' | 'finger-foods' | 'catering' | 'cakes'
  label      TEXT NOT NULL,
  price      INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
```

`GET /api/prices` returns `{ prices: { "<item_key>": <price> }, updated_at }`.
The site fetches once at boot and overlays its baked-in defaults; a failed fetch
leaves today's prices in place, so the site never breaks when D1 is unreachable.

### 5.4 `invoice_versions` — history

```sql
CREATE TABLE IF NOT EXISTS invoice_versions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL,
  version      INTEGER NOT NULL,   -- 1 = original, 2 = first revision
  created_at   TEXT NOT NULL,
  lines_json   TEXT NOT NULL,      -- snapshot at that moment
  total        INTEGER NOT NULL,
  reason       TEXT,               -- 'order-price', 'catalogue-price', 'manual'
  actor        TEXT,               -- chat id or 'admin'
  UNIQUE(order_number, version)
);
```

The renderer is deterministic, so a **snapshot is enough to reproduce any past
version** — no PDF bytes stored.

## 6. PDF layout

### 6.1 Geometry

A4, 595 × 842 pt, margin 48. Base-14 Helvetica, WinAnsi. Content streams stay
uncompressed (greppable, and the existing xref logic depends on byte offsets).

### 6.2 Structure

```
┌─────────────────────────────────────────────────┐
│ [LOGO]                          Company name     │  <- red rule beneath
│ Company phone                    INVOICE         │
│ Company address                  No. …           │
│                                  Issued 07 Nov  │
│                                  [REVISED: V2]  │  <- red pill, near number
├─────────────────────────────────────────────────┤
│ Customer name                                    │
│ Phone: …                                         │
│ Delivery: …                                      │
│ Needed: 07 Nov 2026                              │
├─────────────────────────────────────────────────┤
│ #  DESCRIPTION                    QTY  UNIT  AMOUNT
├─────────────────────────────────────────────────┤
│ …wrapped rows, height grows as needed…           │
├─────────────────────────────────────────────────┤
│                              TOTAL   NGN 39,500  │
├─────────────────────────────────────────────────┤
│ Payment details              │                   │
│ Bank: …                      │      [LOGO]       │
│ Account name: …              │                   │
│ Account number: …            │                   │
├─────────────────────────────────────────────────┤
│         THANK YOU FOR CHOOSING LA'CREME!         │
└─────────────────────────────────────────────────┘
```

### 6.3 Colour rules

- **Red** — company name, the header rule, table head background, `TOTAL`
  amount, `REVISED` pill, `PENDING PRICE REVIEW` band.
- **Gold** — thin accent rules, the payment-block divider, the conclusion
  baseline rule.
- **Body text stays black.** Colour is structural, never decorative.

### 6.4 Wrapping

`wrap(str, size, maxWidth)` returns an array of lines using the existing
`textWidth()` approximation. Each row's height is `lines.length * ROW_H`. A row
that would straddle a page break moves **whole** to the next page. Column widths
subtract the wrapped height from the page budget before deciding.

### 6.5 Pending stamp

When `price_status === 'pending'`, a red band under the invoice number reads
`PENDING PRICE REVIEW — NOT FOR CUSTOMER`. It disappears once approved.

### 6.6 Character safety

A transliteration pass runs on every string before `pdfString`:

| In | Out |
|---|---|
| `—`, `–` | `-` |
| `’`, `‘` | `'` |
| `“`, `”` | `"` |
| `₦` | `NGN ` |

Anything still outside Latin-1 becomes `?` — but after this pass that should
never happen, and the plan verifies it over real order text.

## 7. Pricing state machine

```
order created
   │
   ├─ every line priced ──────────► priced ──► (invoice is final) ──► rep forwards
   │
   └─ any line p === null ────────► pending
                                       │
                       operator sets price (order-specific or catalogue)
                                       │
                                       ▼
                                    priced ──► regenerate + resend PDF
                                       │
                                   operator approves
                                       ▼
                                   approved ──► rep forwards to customer
```

`approved` is only reachable from `priced`. A pending order can never be
approved — the bot refuses with "this invoice is still pending price review".

## 8. Bot commands

| Trigger | Who | Effect |
|---|---|---|
| `/edit-invoice` | Invoice + Owner | Look up an order, show lines, set one line's price. Default **Save price** remembers it on the site; **This order only** does not (§4.1) |
| `/update-price` | **Owner only** | Category → item → new price → writes `product_prices`, live on next site load |
| `/approve` | Invoice + Owner | Mark priced order approved; send final PDF |
| `/cancel` | Invoice + Owner | Abandon the current conversation |

`/update-price` for a cake targets `cake:<spec_key>` — the exact
tiers/inches/layers/flavour/finish combination — so it never exposes the
occasion and never touches unrelated cakes.

Every failure replies explicitly: unknown order, malformed input, line out of
range, timeout. Never silence.

## 9. Security

- Webhook path secret (`TELEGRAM_WEBHOOK_SECRET`) is the credential.
- Catalogue writes require **both** the webhook secret and an owner chat id.
- `/api/prices` is public, read-only, `Cache-Control: public, max-age=60`.
- The client never sends a price the server trusts: `handleCreateOrder` already
  re-validates `lines`; catalogue prices are looked up server-side when
  auto-pricing a repeat order.
- A manipulated browser price cannot reach the invoice.
- `lines_json` is re-validated on read before rendering (existing behaviour).

## 10. Out of scope

- Payment tracking (deposit/balance).
- WhatsApp Cloud API delivery — still a human relay.
- Customer-facing invoice links.
- Multi-currency.

## 11. Open items

| # | Item | Owner | Blocks |
|---|---|---|---|
| 1 | Bank name, account name, account number | Owner | Payment block content |
| 2 | Company phone | Owner | Header contact line |
| 3 | Company physical address | Owner | Header contact line (slot reserved; invoice ships without it) |
| 4 | Confirm red `#C8102E` / gold `#C7A155` | Owner | Colour tuning only |
| 5 | ~~Clean logo JPEG~~ | — | **Resolved 2026-11-09:** `img/logo-crest.jpg` (§3) |
