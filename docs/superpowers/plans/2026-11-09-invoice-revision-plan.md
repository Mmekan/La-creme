# Invoice Revision (R1–R3) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the invoice to the owner's specification (logo, brand colour, wrapping, payment block, prominent revision stamp), then give the operator a Telegram path to price orders and the catalogue — so no price change ever needs a code deploy.

**Architecture:** Three phases on the existing `la-creme-orders` Worker. **R1** is renderer-only (`worker/invoice.js`) and ships a visibly better PDF with no schema or bot dependency. **R2** adds pricing state (`price_status`, `invoice_versions`) and the Telegram webhook, so pending orders can be priced and approved. **R3** moves menu prices into D1 (`product_prices`) with `GET /api/prices` and the owner-only `/update-price`. Each phase is independently shippable; R1 does not depend on R2 or R3.

**Tech Stack:** Cloudflare Workers (ESM, no framework) · D1 · Telegram Bot API (`sendDocument`, `sendMessage`, webhook) · vanilla HTML/CSS/JS, no build step, no `package.json`, no npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-09-invoice-revision-design.md`

---

## Global Constraints

- **No build step, no bundler, no `package.json`, no npm dependencies.** Same as INV-1. `worker/invoice.js` stays a plain relative ES-module import.
- **The PDF renderer stays pure JS with zero dependencies.** Base-14 Helvetica only, no font embedding, no `CompressionStream`.
- **Content streams stay uncompressed.** The xref is built from real byte offsets and the output must stay greppable for verification.
- **No automated test suite is introduced.** Verification is throwaway `node` scripts, `curl` against `wrangler dev`, and explicit browser steps. A failed step is treated exactly like a failing test.
- **Never touch production.** `npx wrangler dev` (local) only. No `wrangler deploy`, no `--remote` D1.
- **`MAX_BODY_BYTES` stays 30 KB.** No change to the order body contract.
- **`items` stays a text blob and is still written.** `admin.js`'s list and `printReceipt` are untouched throughout.
- **Every Telegram send is fire-and-forget via `ctx.waitUntil()` and never throws.**
- **A malformed line must never lose the order.**
- **Missing `settings` values omit their line** — never print an empty label.
- **The customer only ever receives the latest invoice version.**
- **`admin.js` builds DOM with `el()` + `textContent`, never `innerHTML`.**

---

## File Structure

| File | Phase | Action | Responsibility |
|---|---|---|---|
| `worker/logo-data.js` | R1 | Create | Base64 logo bytes + pixel dimensions, generated once |
| `worker/invoice.js` | R1/R2/R3 | Modify | Layout, wrapping, colour, logo, `REVISED`/`PENDING` stamps |
| `tools/build-logo.mjs` | R1 | Create | One-off PNG→PDF-image generator (Node `zlib`, no deps) |
| `worker/schema-pricing.sql` | R2/R3 | Create | `settings`, `product_prices`, `invoice_versions`, new columns |
| `worker/index.js` | R2/R3 | Modify | Settings load, webhook, `/update-price`, `/edit-invoice`, `/approve`, `/api/prices` |
| `worker/bot.js` | R2/R3 | Create | Pure conversation helpers (parse, format, key-building) |
| `index.js` | R3 | Modify | Fetch `/api/prices` at boot, overlay catalogue, pending hint |
| `config.js` | R3 | Modify | `priceOverrides`, `needsPriceHint()` |
| `admin.js` | R2 | Modify | Show `price_status` badge; **Invoice** button unchanged |

`admin.html`, `index.html`, `upload.*`, `gallery.*` need no structural change.

---

# PHASE R1 — Renderer

Ships a finished-looking PDF with **no schema change and no bot**. The owner can
review this in isolation.

### Task R1.1: Embed the logo asset

The Worker cannot read files from disk, so the logo must be a module. The owner
supplied `img/logo-crest.jpg` (302×216, 16 KB, **baseline** JPEG) — baseline
matters, because a progressive JPEG renders blank in some PDF viewers.

Decision: use `logo-crest.jpg`, not `logo.jpg`. Same artwork, but `logo.jpg` is
2100×1500 with wide white margins, so in a fixed-height box the crest itself
would render about a third the size.

- [ ] **Step 1: Confirm it is baseline and record dimensions.**

```bash
cd "/c/xampp/htdocs/La creme"
node -e "
const fs=require('fs'),b=fs.readFileSync('img/logo-crest.jpg');
let i=2;
while(i<b.length){ if(b[i]!==0xFF){i++;continue;}
  const m=b[i+1];
  if([0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF].includes(m)){
    console.log('size',b.readUInt16BE(i+7)+'x'+b.readUInt16BE(i+5),
                'components',b[i+9],
                'progressive',[0xC2,0xC6,0xCA,0xCE].includes(m));
    break; }
  i+=2+b.readUInt16BE(i+2); }"
```

Expected: `302x216 ... progressive false`. **If `progressive` is ever true, stop
and ask for a baseline re-export** — do not ship it.

- [ ] **Step 2: Generate `worker/logo-data.js`.**

No decoding is needed for JPEG — the PDF embeds the file bytes verbatim as a
`DCTDecode` stream.

```bash
node -e "
const fs=require('fs');
const b=fs.readFileSync('img/logo-crest.jpg');
fs.writeFileSync('worker/logo-data.js',
'// Generated from img/logo-crest.jpg - baseline JPEG, embedded verbatim.\n'+
'// Regenerate with: node tools/build-logo.mjs\n'+
'export const LOGO = {\n  width: 302,\n  height: 216,\n'+
'  jpeg: \\''+b.toString('base64')+'\\',\n};\n');
console.log('bytes', b.length);"
```

- [ ] **Step 3: Confirm it compiles and round-trips.**

```bash
node --check worker/logo-data.js
node -e "import('./worker/logo-data.js')
  .then(m=>console.log(m.LOGO.width, m.LOGO.height, m.LOGO.jpeg.length))"
```

- [ ] **Step 4: Add the PDF image object.**

In `renderInvoice`, reserve one object:

```
<< /Type /XObject /Subtype /Image /Width 302 /Height 216
   /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode
   /Length <n> >>
stream
<raw jpeg bytes>
endstream
```

Because the bytes are binary, they must be written as raw bytes in the assembler,
**not** through `latin1()`. Split the file assembly into byte chunks and keep
`offset` accurate, or the xref desynchronises.

Reference it from each page that draws it:
`/Resources << /Font << … >> /XObject << /Im1 <id> 0 R >> >>`, then
`q <w> 0 0 <h> <x> <y> cm /Im1 Do Q`.

- [ ] **Step 5: Placement rule.**

JPEG has no alpha, so the logo carries a white rectangle. **Draw it only on
white areas** — the header (left) and the payment block (right). Never on the
red header band or any coloured fill.

- [ ] **Step 6: `tools/build-logo.mjs`.**

Wrap Steps 1–2 in a committed script so the asset is reproducible rather than
hand-pasted, and so swapping in a different logo later is one command.

- [ ] **Step 7: Verify the xref survived binary data.**

Parse the finished PDF and confirm every xref offset still lands on
`<n> 0 obj`, and that the stream length for `Im1` equals the JPEG byte length.
This is the step most likely to break, because it is the first binary stream in
the file.

### Task R1.2: Settings loader

- [ ] **Step 1: Add the settings reader to `worker/invoice.js`.**

Export `DEFAULT_SETTINGS` (all empty strings) and have `renderInvoice` accept
`order.settings` — an optional plain object. Missing keys fall back to empty.
**An empty value omits its line entirely.**

- [ ] **Step 2: Wire it in `worker/index.js`.**

`handleGetInvoice` reads `SELECT key, value FROM settings` and passes the map
into `renderInvoice`. A failed read must not fail the endpoint — fall back to
defaults and log.

### Task R1.3: Layout rewrite

**Files:** `worker/invoice.js`

- [ ] **Step 1: Add primitives.**

Extend the existing two (`text`, `rule`) with:

```js
const fill   = (x, y, w, h, rgb) => /* re .. f */
const bar    = (y, h, rgb)       => /* full-width band */
const box    = (x, y, w, h, rgb) => /* padded pill */
const image  = (x, y, w, h)      => /* /Im1 Do */
```

Keep everything positioned — no flow engine.

- [ ] **Step 2: Add colour constants.**

```js
const RED  = [0.784, 0.063, 0.180];  // #C8102E
const GOLD = [0.780, 0.631, 0.333];  // #C7A155
const BLACK = [0, 0, 0];
```

- [ ] **Step 3: Replace `fit()` with `wrap()`.**

`wrap(str, size, maxWidth)` splits on spaces, greedily filling lines, and
returns an array. It must never break mid-word unless a single word exceeds
`maxWidth`, in which case it hard-splits. `fit()` is removed.

- [ ] **Step 4: Rebuild `header()`.**

Left: logo XObject + `LA CRÈME` in red + phone + address (each omitted when
empty). Right: `INVOICE`, `No. …`, `Issued 07 Nov 2026`, and — when
`revised > 1` — a red pill reading `REVISED: V{n}` positioned directly beneath
the invoice number. When `price_status === 'pending'`, a red band beneath that
reads `PENDING PRICE REVIEW - NOT FOR CUSTOMER`.

A red rule closes the header block.

- [ ] **Step 5: Rebuild the customer block.**

Name, `Phone: …`, delivery line, `Needed: 07 Nov 2026`. Date goes through
`fmtDate`; if it does not parse (free-text like "Next Saturday"), print as-is.

- [ ] **Step 6: Rebuild the table.**

Red band behind the column heads with white bold text. Wrap the description
column; row height = `lines.length * ROW_H`. Money columns stay right-aligned to
`COL_QTY_R`, `COL_UNIT_R`, `COL_AMT_R`. A wrapped row moves whole to the next
page rather than splitting.

- [ ] **Step 7: Rebuild the tail.**

`TOTAL` + amount (red, bold), then the payment block on the **left** with the
logo on the **right**, then the conclusion centred in caps:
`THANK YOU FOR CHOOSING LA'CREME!`

Total appears **before** payment details, per spec §2.6.

- [ ] **Step 8: Add the transliteration pass.**

`translit(str)` maps `—`/`–` → `-`, `’`/`‘` → `'`, `“`/`”` → `"`, `₦` → `NGN `.
Call it inside `pdfString()` so nothing can bypass it.

### Task R1.4: Verify R1

- [ ] **Step 1: Render four cases.**

```bash
node -e "
import('./worker/invoice.js').then(async m=>{
  const fs=await import('fs');
  const mk=(lines,x={})=>({order_number:'20261109-101500123-AB',
    received_at:'2026-11-09T10:15:00Z', name:'Adaeze Okonkwo',
    phone:'0803 123 4567', delivery:'Delivery',
    address:'12 Iyala Street, Uyo', date_needed:'2026-11-15',
    revised:1, price_status:'priced',
    lines_json:JSON.stringify(lines), ...x});
  const cases={
    mixed: mk([{d:'Meat Pie',q:2,p:1000},
               {d:'Afang Soup, 5L, Goat Meat',q:1,p:30000},
               {d:'Puff Puff (per dozen)',q:3,p:2500}]),
    pending: mk([{d:'Birthday Cake, Two Steps, Chocolate, Fondant',q:1,p:null}],
               {price_status:'pending',revised:1}),
    longtext: mk([{d:'Jollof Rice, 5L, Chicken (4 pcs) - party style with salad and plantain on the side',q:1,p:25000}]),
    empty: mk([]),
  };
  for (const [n,o] of Object.entries(cases))
    fs.writeFileSync('sample-'+n+'.pdf', Buffer.from(m.renderInvoice(o)));
  console.log('ok');
})"
```

- [ ] **Step 2: Assert the structural guarantees.**

Read each file back and check:
- `%PDF-1.4` header and `%%EOF` present
- every xref offset lands on `<n> 0 obj`
- no `?` appears inside a `(...)` string
- `THANK YOU FOR CHOOSING LA'CREME!` present
- `REVISED: V2` present only where `revised > 1`
- `PENDING PRICE REVIEW` present only when pending
- payment block precedes the conclusion
- no line of text overlaps the footer band

- [ ] **Step 3: Confirm wrapping.**

The `longtext` sample's description must appear as **two or more** `Tj` draws
on consecutive baselines, not one truncated string with `..`.

- [ ] **Step 4: Render to an image for a human eye.**

Convert one sample to PNG (any available viewer or OS print-to-image) and open
it. This is the step INV-1 skipped — do not mark R1 done without it.

- [ ] **Step 5: `node --check`.** `worker/invoice.js`, `worker/index.js`,
  `worker/logo-data.js`.

---

# PHASE R2 — Pricing state + bot

### Task R2.1: Schema

- [ ] **Step 1: Write `worker/schema-pricing.sql`.**

```sql
ALTER TABLE orders ADD COLUMN price_status TEXT NOT NULL DEFAULT 'priced';
ALTER TABLE orders ADD COLUMN spec_key TEXT;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoice_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL, version INTEGER NOT NULL,
  created_at TEXT NOT NULL, lines_json TEXT NOT NULL,
  total INTEGER NOT NULL, reason TEXT, actor TEXT,
  UNIQUE(order_number, version)
);
```

- [ ] **Step 2: Apply locally.** `npx wrangler d1 execute <db> --local --file=worker/schema-pricing.sql`
- [ ] **Step 3: Confirm shape** with `PRAGMA table_info(orders)`.

### Task R2.2: Pending detection on create

- [ ] **Step 1:** In `handleCreateOrder`, set `price_status` to `'pending'` when
  any validated line has `p === null`, else `'priced'`.
- [ ] **Step 2:** Write `spec_key` for cake orders (see R3.2 for the key format;
  in R2 just store it — matching arrives in R3).
- [ ] **Step 3:** Insert version 1 into `invoice_versions` (snapshot + total).
- [ ] **Step 4:** Patch the Telegram caption to say `PENDING PRICE REVIEW` when
  pending, so the operator knows immediately.
- [ ] **Step 5:** `sendInvoiceToCompany` fans out to the **union** of
  `TELEGRAM_INVOICE_CHAT_IDS` and `TELEGRAM_OWNER_CHAT_IDS` (deduped), so the
  owner gets the same notifications as the company without being listed twice.

### Task R2.3: Webhook

- [ ] **Step 1:** Add `POST /api/tg/<secret>`. Compare against
  `TELEGRAM_WEBHOOK_SECRET`; unknown path → 404 with no body detail.
- [ ] **Step 2:** Answer Telegram immediately; do the work in `ctx.waitUntil`.
- [ ] **Step 3:** Dedupe on `update_id` (a small `bot_updates` table or a
  `settings` key window). A repeat is acknowledged and ignored.
- [ ] **Step 4:** Authorise by chat id: `TELEGRAM_INVOICE_CHAT_IDS` or
  `TELEGRAM_OWNER_CHAT_IDS`. Anything else gets one line, no order data.

### Task R2.4: `/edit-invoice` and `/approve`

- [ ] **Step 1:** `bot_state` table (`chat_id` PK, `step`, `order_no`,
  `updated_at`) — 15-minute timeout.
- [ ] **Step 2:** `/edit-invoice` → ask for order number → show numbered lines →
  parse `2 = 4500` / `2 = -` (set back to unpriced) → write the line, recompute
  total, bump `revised`, snapshot a new version, re-render, resend.
- [ ] **Step 3:** Offer the two write modes from spec §4.1, with **Save price**
  as the default inline button and **This order only** as the alternative.
  Save price also upserts `product_prices` so the next identical order
  auto-prices; This order only leaves the catalogue untouched.
- [ ] **Step 4:** Reject a price write on an `approved` order unless it also
  bumps the version — an approved invoice must never change silently.
- [ ] **Step 5:** `/approve` → refuse unless `price_status === 'priced'` → set
  `'approved'` → send the final PDF.
- [ ] **Step 6:** `/cancel` clears `bot_state`.
- [ ] **Step 7:** Every failure replies explicitly (unknown order, malformed,
  out of range, timeout).

### Task R2.5: Admin badge

- [ ] **Step 1:** Show `price_status` on the order card (`PENDING` / `APPROVED`).
- [ ] **Step 2:** Leave the **Invoice** button and `apiBlob()` untouched.

### Task R2.6: Verify R2

- [ ] Pending order → webhook → `/edit-invoice` → `2 = 4500` → total changes →
  new version row → PDF resends with `REVISED: V2`.
- [ ] **Save price** writes `product_prices`; **This order only** does not —
  confirmed by querying the table after each.
- [ ] Company chat can review and price; company chat **cannot** call
  `/update-price`; owner chat can.
- [ ] Both chats receive the order + invoice notification for the same order.
- [ ] `/approve` on a pending order is refused.
- [ ] `/approve` on a priced order stamps `approved` and resends.
- [ ] Duplicate `update_id` → exactly one revision.
- [ ] Unauthorised chat → no order data in the reply.
- [ ] Fully-priced order → `price_status` is `priced`, no prompt appears.

---

# PHASE R3 — Live catalogue prices

### Task R3.1: Storage and endpoint

- [ ] **Step 1:** Add `product_prices` (see spec §5.3).
- [ ] **Step 2:** `GET /api/prices` → `{ prices, updated_at }`, public,
  `Cache-Control: public, max-age=60`.
- [ ] **Step 3:** Seed from the current hardcoded values so nothing changes on
  day one:

```js
// key format: '<item id>:<size>' for soups/rice, '<id>' for finger foods
// e.g. 'afang:5L' -> 30000, 'sc-plate-standard' -> 2500
```

### Task R3.2: Cake spec key

- [ ] **Step 1:** `cakeSpecKey(cake)` in `config.js` and mirrored in `worker/bot.js`:

```js
norm(cake.tiersLabel) + '|' +
norm(cake.tierDetails.slice().sort().join(' ; ')) + '|' +
norm(cake.flavor) + '|' +
norm(cake.finish || '')
```

`norm()` = trim, lowercase, collapse whitespace. This also fixes the existing
`<option>Chocolate </option>` trailing-space mismatch.

- [ ] **Step 2:** Custom (`isCustom`) and Wedding cakes return `null` — always
  pending, never matched.

### Task R3.3: `/update-price`

- [ ] **Step 1:** Owner-only. Flow: category → item → current price → new price.
- [ ] **Step 2:** Write `product_prices`, reply with the applied change.
- [ ] **Step 3:** `GET /api/prices` reflects it on the next request (≤60 s edge).

### Task R3.4: Site integration

- [ ] **Step 1:** `config.js` gains `PRICE_OVERRIDES` + `applyPrices(map)`.
- [ ] **Step 2:** `index.js` fetches `/api/prices` at boot, overlays the menu
  arrays, and re-renders. Failure leaves the baked-in values — never blank.
- [ ] **Step 3:** When the cart contains a null-price line, checkout shows
  *"This item's price will be finalised on WhatsApp."* Only for that case.

### Task R3.5: Verify R3

- [ ] `/update-price soups afang 32000` → `GET /api/prices` returns 32000 →
  site renders ₦32,000 after reload.
- [ ] Repeat cake with identical spec auto-prices from catalogue.
- [ ] Same cake with different inches → pending, not auto-priced.
- [ ] Custom/Wedding → always pending.
- [ ] Unauthorised chat calling `/update-price` → refused, no write.
- [ ] Prices endpoint down → site still shows baked-in values.

---

## Rollout

1. **R1** — deploy alone. Owner reviews the PDF. No schema, no bot, no risk to orders.
2. **R2** — needs `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_INVOICE_CHAT_IDS`
   (owner id for now), and `setWebhook`. Orders keep flowing if the webhook fails.
3. **R3** — needs `TELEGRAM_OWNER_CHAT_IDS`. Seeded prices mean the site is
   unchanged until the first `/update-price`.

## Sign-off gates

| Gate | Blocks |
|---|---|
| Owner approves the R1 PDF visually (Task R1.4 Step 4) | R1 commit |
| Bank/phone supplied | Payment + contact block content |
| Company Telegram id supplied | Adding the operator to the allowlist |