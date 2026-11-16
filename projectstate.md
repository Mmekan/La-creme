# Project State — La Crème

**Updated:** 2026-11-16 (R3.4c — the Worker prices every menu line; R3.5 verified in a browser against a seeded local D1; still not deployed)
**HEAD:** `e0833bd` (R3.4d) + the docs commit on top · Phases 1–6 + R1–R3.5 committed · branch `invoice-revision` (11 commits ahead of `origin/invoice-revision`, not pushed); `main` is untouched and still behind

This file is the "where am I" record. Update it after each task.
`todo.md` is the "what comes next" list.

---

## The phased plan this work belongs to

Origin: a 14-item change list from the customer, split into phases and approved
in that order. Phase plan text lives in the past session
`c405307b-5165-44ed-853d-f15df3559e8b` (recoverable via `deja recall`).

| Phase | Scope | Status |
|---|---|---|
| 0 | Read-only inventory of every modal/overlay + gallery→menu mapping | ✅ done |
| 1 | #1, #4, #6 — global modal-close contract, sticky heads, filter swipe hint | ✅ done |
| 2 | #2, #3 — finger-food preview circles + first-selection hint | ✅ done |
| 3 | #5, #9, #10, #11, #12, #13 — content/config corrections | ✅ done |
| 4 | #14 — soups use the rice cart mechanism | ✅ done |
| **5** | **#7 — upload "Clear selection" + admin password asks once per 15 min** | **✅ done** |
| **6** | **#8 — order directly from a gallery image** | **✅ done (`8cc0704`)** |
| **INV-1 / R1** | **PDF invoice on every order → Mekabot → company Telegram; renderer rebuilt to the owner's spec** | **✅ built, not deployed** |
| **R2.1–R2.3** | `price_status` + `invoice_versions` schema · pending detection on create · Telegram webhook | ✅ done |
| **R2.4** | `/edit-invoice` + `/approve` — buttons, optimistic guard, re-issue | ✅ done (`654f347`) |
| **R2.5** | Admin `price_status` badge | ✅ done (`1be2df2`) |
| **R2.6** | Verify R2 — full page + API + bot sweep | ✅ exercised 2026-11-10 |
| **R3.1–R3.3** | `GET /api/prices` + seed · cake spec key · `/update-price` + `/prices` | ✅ done |
| **R3.4a** | Repeat cake auto-prices from the catalogue (server-side) | ✅ done |
| **R3.4b** | Site's displayed menu reads `/api/prices`; P1–P5 fixed | ✅ built, not deployed |
| **R3.4c** | Worker prices every menu line from its catalogue key | ✅ done (`0e55bb6`) |
| **R3.4d** | Fail closed on D1 errors; price from the line description, not the key | ✅ done 2026-11-16 |
| **R3.5** | Verify R3 in a browser against a seeded local D1 | ✅ done 2026-11-16 |

The INV-2/INV-3 naming below is superseded by R1–R3 in the plan file
[docs/superpowers/plans/2026-11-09-invoice-revision-plan.md](docs/superpowers/plans/2026-11-09-invoice-revision-plan.md).

---

## What Phase 4 changed (#14)

Customer's words: *"Just like the rice menu, where you can add an item to the
cart and still add same rice but with a different protein, let that entire
mechanism work in soups."*

**Before:** `catState.soups` was an object keyed by soup item id — one slot per
soup, committed live on every chip click. Choosing a second protein silently
overwrote the first.

**After:** `catState.soups` is an array of committed entries, mirroring
`catState.rice`.

Files: `index.js`, `index.css`.

- `catState = { soups:[], rice:[], proteins:{} }` + new `soupEntryCounter`.
- `buildSoupRow()` is a staged picker: size → protein → quantity →
  **Add to Cart**. Add stays hidden until size *and* protein are chosen; the
  row resets after adding. Changing size starts the pick over.
- Adding an identical size+protein folds into the existing line's quantity
  (with a toast); a different protein gets its **own line**.
- Entry shape: `{ key, itemId, name, label, unitPrice, qty, sel:{label, protein} }`.
- `CART_SOURCES.cat.lines()` walks the array; `soup:<key>` lines remove by key.
- Checkout WhatsApp lines built from `catState.soups.map(...)`.
- `restoreCartState()` replays saved soup entries like rice, validating each
  stored size/protein against the live menu first (the label is interpolated
  into a selector, so this also keeps that safe).
- `clearFingerFoodAndCateringCart()` resets the staged row and empties the array.
- `syncCartStates()`: soup rows are "in cart" when a committed entry exists,
  not from the live stepper value.
- Checkout re-validates every soup entry before building the message.
- `.rice-add-btn` renamed to the shared `.cart-add-btn`.

---

## What Phase 5 changed (#7)

### Upload page — Clear selection

Files: `upload.html`, `upload.js`.

- New **Clear selection** ghost button under *Send photos*, hidden until at
  least one photo is staged.
- It reuses `reset()`, so it clears files, thumbnails, progress, the retry
  button and every error line, mints a fresh batch id, and **preserves the
  chosen category**.
- Disabled while a send is in flight, and the click handler refuses if
  `sending` is true.
- Nothing remote is touched — already-sent photos are in R2 and the admin
  dashboard and stay there.
- New `selectionGen` counter: clears that land while photos are still being
  resized (async) abandon those results instead of repopulating a list that
  was just emptied.

### Admin page — password once per 15 minutes

File: `admin.js`.

**Important:** the upload page has **no password at all** (deliberate —
unlisted URL, `noindex`, per the spec). The password the customer was thinking
of belongs to [admin.html](admin.html). That is what changed here.

- Session is now `{ token, exp }` in **localStorage** under `lcAdminSession`,
  with `exp = login + 15 minutes` (was: bare token in `sessionStorage`, which
  re-asked on every new tab).
- `readSession()` returns the token only while unexpired; otherwise it removes
  the entry and the login form shows.
- `signOut()`, the 401 handler, login success and the boot check all use it.
- The server's own token is still 12h — this only controls how often the
  password is re-asked, so the window is a convenience, not a security
  boundary. Token is now readable from localStorage for those 15 minutes.

---

## What Phase 6 changed (#8)

Files: `gallery.html`, `gallery.js`, `index.html`, `index.js`, `index.css`.

### Gallery side

- **Lightbox Order button** (`#lightboxOrder`), under the caption. `ORDER_ROUTES`
  in `gallery.js` keys off the item's **own** `category`, not the active filter,
  so the "Cakes" catch-all (which has no tab) still gets a route:

  | category | label | goes to |
  |---|---|---|
  | Wedding Cakes, Traditional Wedding Cakes | Order this cake | `?order=cake&occasion=Wedding#cakes` |
  | Anniversary | Order this cake | `?order=cake&occasion=Anniversary#cakes` |
  | Cakes, Cakes for Boys/Girls/Men/Women | Order this cake | `?order=cake&occasion=Birthday#cakes` |
  | Small Chops | Order Small Chops | `?order=smallchops#finger-foods` |
  | Catering & Events | Book your event | `?order=catering#catering` |

  An unrouted category hides the button rather than showing a dead link.
- The dead **Gallery** nav link is a working **Home** link (`gallery.html:94`).

### Menu side

- `handleOrderArrival()` in `index.js` reads `?order=` once at boot:
  - **cake** — sets the occasion select (validated against the form's own
    options first, so a hand-edited `?occasion=` can't blank the select),
    scrolls `#cakes` into view, pulses the cake form,
    toast *"How would you like the cake?"*
  - **smallchops** — scrolls `#finger-foods`, pulses the first row,
    toast *"Complete your small chops order."*
  - **catering** — scrolls the **booking card** into view (centre) and pulses
    it, toast *"Planning an event? Tap Book Event Catering below."*
  - then `history.replaceState()` drops the query but keeps the hash, so a
    refresh re-lands on the section without re-firing the toast or occasion.
- `.arrival-pulse` (one-shot gold ring, 2.8s) in `index.css`.

### Book catering for an event

The owner's addition: apart from building a litres-and-proteins cart, a host
should be able to just book the spread.

- **Book Event Catering** card in `#catering`, between the intro and the soup
  list: heading, one line of reassurance, wine button.
- The button is a `wa.me` link whose message pre-types the four things we
  can't quote without — `Event type:`, `Date:`, `Guests:`, `Venue:` — each on
  its own line, for the customer to fill in WhatsApp. Set in `index.js` next to
  the other generic WA buttons; it works with or without the `?order=` arrival.
- Layout: flex row that wraps (text left / button right), button goes
  full-width under 620px. Verified at 1258 / 738 / 512px — no horizontal
  overflow at any of them.

Still open: whether the Order button should also sit on the gallery filter bar
(order "this category") — currently lightbox-only, as specified.

### Checkout — the cake order's delivery carries over

Reported 2026-11-05: a cake plus finger foods/catering goes through the combined
checkout, which asked **Delivery/Pickup and the address again from a blank
slate** — even though the cake form had just collected exactly that. The step
had to stay (it's the one delivery line for the whole order); what was wrong
was it starting empty.

- `carryCakeDeliveryIntoCheckout()` (called from `openCheckoutModal()`):
  when a cake is in the cart and the cake form has a delivery answer, the chip
  is preselected and, for Delivery, the address is copied across if the
  checkout address is still empty.
- A gold-bordered note under the chips says where it came from — *"Carried
  over from your cake order, address included. If this one is going somewhere
  else, change it above."* — so it reads as a confirm-or-change, not a silent
  setting.
- Clicking either chip hides the note: the value on screen is then the
  customer's own, not a carried one.
- Skipped when there's no cake, when the cake form never answered delivery,
  or when the customer already picked in this modal (reopening doesn't
  overwrite their choice).
- The delivery chip handler was folded into `applyCheckoutDelivery()` so the
  prefill and a real click run identical logic.

---

## What INV-1 changed (PDF invoice on every order)

Files: `worker/invoice.js` (new), `worker/schema-invoice.sql` (new),
`worker/index.js`, `config.js`, `index.js`, `admin.js`, `worker/README.md`.

**Client — structured lines.** `invoiceLines()` in `config.js` maps cart lines
to `{d, q, p}` (description, quantity, unit price in naira, or `null` for
"price via WhatsApp"). Both `logOrder()` call sites pass a `lines` array: the
cake-only checkout sends one unpriced line per cake, the combined checkout
sends finger foods + catering + cakes. `p` is `null` whenever a line carries a
`priceLabel`, so a ₦0 placeholder can never invoice as ₦0. Capped at 100 lines
client-side to keep the order body inside the API's 30 KB limit.

**Storage.** `orders.lines_json` (TEXT) and `orders.revised` (INTEGER, default
0). `items` is still written and still what the admin list and `printReceipt`
render from. `schema-invoice.sql` is `ALTER TABLE`, so re-running it errors
with `duplicate column name` — that error is the expected outcome.

**Validation.** `validateLines()` drops anything it cannot trust (non-object,
empty description, non-integer or out-of-range quantity, negative price) rather
than rejecting the order. It runs on write *and* on read, so a hand-edited row
cannot inject into the PDF. `serializeLines()` caps the stored JSON at 12,000
UTF-8 bytes by dropping from the tail.

**The PDF.** `renderInvoice(order)` in `worker/invoice.js` — hand-rolled, zero
dependencies, base-14 Helvetica with `WinAnsiEncoding`, uncompressed content
streams, A4, paginates at ~34 rows with a repeated table head and `Page n of m`.
Everything visible is built from two primitives (`text`, `rule`), so a layout
change is one function. Object numbers are reserved lazily and the xref is
built from real byte offsets. Money prints as `NGN 38,000` — base-14 fonts have
no naira glyph. Cakes print `Price via WhatsApp` and are excluded from the
total; an all-unpriced order shows `Price via WhatsApp` as the total rather
than `NGN 0`. `REVISED v{n}` stamps when `revised > 0` (first correction = v2).

**Delivery.** `sendDocument()` posts multipart to Telegram; `sendInvoiceToCompany()`
fans out to every id in `TELEGRAM_INVOICE_CHAT_IDS` (comma-separated, deduped,
capped at 20) with the order summary as the caption. Fired from
`handleCreateOrder` via `ctx.waitUntil`, and **only when the insert actually
created a row** (`meta.changes`) — `logOrder`'s sendBeacon/fetch fallback can
post the same order twice, and a duplicate must not invoice twice. Upload
alerts still use `TELEGRAM_CHAT_ID`; there is no fallback between the two.

**Admin.** `apiBlob()` (a binary sibling of `api()`, same 401 → sign-out
contract) plus an **Invoice** button on the order card that downloads
`LaCreme-Invoice-<no>.pdf`. `printReceipt` is untouched.

**Endpoint.** `GET /api/orders/:no/invoice`, admin token only, `no-store`,
`Content-Disposition: attachment`. Rows with `lines_json IS NULL` fall back to
the `items` blob as unpriced lines, so historical orders still produce a
document.

---

## Invoice workflow — INV-1 built 2026-11-07; R1–R2.4 done, R2.5/R2.6/R3 next

Spec: [docs/superpowers/specs/2026-11-06-invoice-workflow-design.md](docs/superpowers/specs/2026-11-06-invoice-workflow-design.md)
Plan: [docs/superpowers/plans/2026-11-06-invoice-inv1.md](docs/superpowers/plans/2026-11-06-invoice-inv1.md)

Built and verified against `wrangler dev`; **nothing is deployed**. The plan
evolved from INV-1/2/3 into R1–R3 (`2026-11-09-invoice-revision-plan.md`):
R1 (renderer) and R2.1–R2.4 (pricing state, webhook, `/edit-invoice`,
`/approve`) are done. **Next:** R2.5 (admin badge) and R2.6 (verify R2), then
R3 (live catalogue prices).

**The flow, in the owner's words:** customer places an order → order text
notification on company WhatsApp (unchanged) → Mekabot receives the PDF invoice
from the site → Mekabot sends it to company Telegram → the sales rep downloads
and forwards it to the customer on WhatsApp. If the order changes in chat, the
rep uses buttons or `/edit-invoice` on Telegram → Mekabot asks for the order
number → she pastes it → Mekabot asks for the price/item change → the site
updates so the admin panel tallies → the site re-sends the updated PDF →
invoice goes to the customer → payment confirmed (manual).

**Key decisions:**

- **Existing `la-creme-orders` worker.** No new service.
- **Hand-rolled PDF renderer, zero dependencies.** Workers can't take native
  PDF libs. Prints `NGN 38,000`, not `₦` — base PDF fonts have no naira glyph.
- **Mekabot is the one bot.** Site → Mekabot → company Telegram; company
  Telegram → Mekabot (buttons or text) → worker → back.
- **Two destinations, one bot:**
  - Upload alerts → `TELEGRAM_CHAT_ID` (existing, unchanged).
  - Invoices + bot replies → `TELEGRAM_INVOICE_CHAT_IDS` (new,
    comma-separated, extensible — adding a rep is `wrangler secret put`, no
    code change, no redeploy).
- **`bot_state` keyed by `chat_id`**, so multiple reps correcting different
  orders never collide.
- **Bot-only `revise` endpoint** (webhook secret), separate from the admin
  token — the rep never needs the admin password.
- **Invoice layout is a first draft.** The renderer is built as small
  positioned primitives so the owner's layout changes are one function.

**Data:** `orders.lines_json` + `orders.revised` (two new columns), and a new
`bot_state` table. The existing `items` text blob and `printReceipt` are
untouched.

---

## Invoice letterhead + ASCII/NGN pass — 2026-11-10 (uncommitted)

Prompted by the owner asking why the bot didn't "just use NGN" and to stop
putting emoji/em dashes/arrows in invoice output.

- **One currency spelling.** `money()` in `worker/bot.js` now returns
  `NGN 38,000`, matching `invoice.js`, which already printed `NGN ` (base-14
  fonts have no naira glyph). The bot and the PDF used to disagree.
- **ASCII-only user-facing text.** In `worker/bot.js` and the bot/invoice
  strings in `worker/index.js`: em dash `—`→`-`, arrow `→`→`->`, `×`→`x`,
  bullet `•`→`-`, and the 🧾/⏳ emoji removed from every invoice caption.
  Code comments were left as-is. *Not* swept: the upload-pipeline alerts
  (`⚠️`/`🔔`) and two upload API error strings — different feature.
- **Letterhead.** `DEFAULT_SETTINGS.company_name` is now
  `La'Creme Confectionery`; the name renders on the order-number baseline
  (`y-27`), left-aligned in the logo's column (`x≈120`), with the phone/
  address stack starting at `y-41`. Verified numerically: name ends x=305,
  order number starts x=422 — no collision.
- **Defaults filled** for every `DEFAULT_SETTINGS` field including
  `bank_name`/`account_name`/`account_number`, so the PAYMENT DETAILS block
  renders instead of staying blank.
- **Demo harness fixed.** `tools/demo-bot.mjs` hardcoded `/api/tg/s3cret`;
  the real `TELEGRAM_WEBHOOK_SECRET` differs, so every update 404'd and the
  demo printed nothing. It now reads `DEMO_SECRET` from the environment.
  Confirmed real secret → 200, wrong secret → 404.
- **Tests:** `node tools/test-bot.mjs` → 28/28 pass (updated for NGN).

⚠️ **Superseded by P-3 (2026-11-11).** `renderInvoice()` now reads the D1
`settings` table through `loadSettings()`, and the four placeholder values
(`company_phone`, `company_address`, `bank_name`, `account_number`) are
blanked rather than printed. See "Phase 1 — P-3" below.

---

## R3.4d — fail closed, and price from the description

**2026-11-16.** Files: `worker/index.js`, `worker/invoice.js`, `config.js`,
`index.js`, `worker/seed-prices.sql`, both pricing test suites.

Two holes in R3.4c, found by review before deployment:

- **A D1 failure fell back to the client's price.** Both pricing passes
  kept the request's `p` when the read threw — the exact manipulation
  route R3.4c was meant to close. `handleCreateOrder` now blanks every
  line's `p` **before** pricing, so a failed read leaves the line pending.
  The client is never a price source, for menu lines or cakes.
- **The catalogue key was trusted.** A request could name a cheaper
  existing key. Pricing no longer reads `k`: a menu line is priced from
  the catalogue row its own **description** names, the same text the
  invoice prints. `k` is still stored, for audit only.
- **Prefix matching, not subset.** The first run of the new rule priced a
  deleted Egusi soup at ₦2,200 because "Beef" (the protein at the end of
  the description) was a catalogue row. A label must now be a **prefix**
  of the description; the most specific label wins; no match or a tie
  leaves the line pending.
- **Cake lines are marked.** The site sends `cake: true` on cake lines and
  `validateLines` keeps the marker (boolean only). Cake lines are priced
  by `spec_key`, never by description, and follow the same fail-closed
  rule.
- **Seed labels trimmed.** The four protein labels lost "(per portion)" so
  each label is a word-for-word prefix of the line the site sends.
- **Residual:** a description naming two sizes prices the first one. The
  invoice prints the whole description, so a human sees it. Closing that
  needs per-category token rules — more drift than it is worth.

Verified: `test-catalogue-price` 39/39 (fail-closed menu + cake,
cheaper-key, protein collision, ambiguous, missing label, zero price),
`test-live-prices` 58/58, `test-invoice` 34/34, `test-bot` 46/46,
`test-spec-key` 24/24. Browser 23/23, endpoint-down 4/4. Three tampered
orders against a real local Worker stored `70000 / null / null`, all
`pending`, none of the sent prices.

---

## R3.5 — verified in a browser against a seeded local D1

**2026-11-16.** Files: `tools/serve-test.mjs` (new), `tools/test-browser.mjs`
(new). No product code changed.

- **What was run.** A local D1 with all four schemas + `seed-prices.sql`
  (34 rows), `wrangler dev --local` on 8792, the real site served on 8899
  with `config.js`'s `ordersApi` overridden in the response only, and
  Chrome driven by Playwright.
- **Server checks (curl + D1 reads).** `/update-price afang:10L 70000`
  from the owner chat → `/api/prices` returns 70000; the same command from
  a non-owner chat and an unknown key both change nothing. A keyed order
  sent with `p: 1 / 0 / 999999` was stored as `70000 / 24000 / 1000` and
  `priced`; deleting `egusi:10L` from the catalogue made the next order
  `p: null` and `pending`. A repeat cake spec priced at 45000; the same
  cake with different inches and a Wedding cake both stayed pending.
- **Browser checks (21/21).** The menu shows `10L (₦70,000)` and shows no
  price for the deleted key; the cart, the dropdown, the WhatsApp text and
  the `/api/orders` body all agree; every line in the body carries its
  catalogue key.
- **Endpoint down (4/4).** With `ordersApi` pointed at a dead port the
  catalogue never applies, the chips keep their baked-in prices, and the
  cart still prices from the constant while carrying the key.
- **Re-running it.** Prerequisites are in the `tools/test-browser.mjs`
  header. `--offline` runs the endpoint-down half against a second server
  (`PORT=8898 WORKER=http://127.0.0.1:8799 node tools/serve-test.mjs`).
  Playwright is resolved from `playwright` or the global
  `@playwright/cli` bundle; run with `NODE_PATH="$(npm root -g)"`.

---

## R3.4c — the Worker prices every menu line

**2026-11-16.** Files: `config.js`, `index.js`, `worker/index.js`,
`worker/invoice.js`, `tools/test-catalogue-price.mjs`,
`tools/test-live-prices.mjs`.

- **The hole.** R3.4a re-priced cakes only. Soups, rice, finger foods and
  proteins still carried the client's `p`, so a stale page or a tampered
  body decided what an invoice charged — against spec §9.
- **The key travels with the line.** `CART_SOURCES` now puts `key` on
  every menu line (`i.id`, `soupKey(itemId, size)`, `riceKey(itemId, type,
  style)`, `p.id`); `invoiceLines()` sends it as `k`. `soupKey`/`riceKey`
  are the same helpers the menu lookup uses, so the displayed price and
  the server's re-price cannot describe different rows.
- **The Worker decides.** `priceLinesFromCatalogue()` collects the
  distinct keys, reads them in one chunked `IN (...)` query (50 per
  query, D1's bound-parameter cap), and replaces `p` on every keyed line.
  A key the catalogue lacks becomes `p: null` — the P4 pending rule,
  applied server-side. A D1 failure keeps what the client sent rather
  than turning every order pending on a flaky read.
- **Untouched lines.** Cake lines have no key (priced by `spec_key`,
  R3.4a), and a page cached before this commit sends no keys at all.
- **`validateLines()` keeps `k`** — printable ASCII, 120 chars — so the
  key survives into `lines_json` and the invoice-version snapshot.
- ~~**Residual risk, accepted.** The key is client-supplied, so a tampered
  client could name a cheaper *existing* key.~~ **Closed by R3.4d**
  (below): pricing no longer reads the key; it prices from the line's own
  description.
- **Tests:** `test-catalogue-price` 39/39 (keyed lines priced, sent
  prices ignored, missing key pending, mixed cake+menu, D1 failure,
  malformed keys), `test-live-prices` 56/56 (key shapes match the seed,
  `invoiceLines` carries the key).

---

## R3.4b — the site's menu reads the catalogue (and P1–P5)

**2026-11-13.** Files: `config.js`, `index.js`, `worker/bot.js`,
`worker/index.js`, `tools/test-live-prices.mjs` (new).

`loadPrices()` fetches `/api/prices` after the first render and repaints
every row in place through a `syncPrice()` hook on the element; a failed
fetch changes nothing, so the menu still works offline. The audit that
preceded this found five bugs, all fixed here:

- **P1** — the cart dropdown printed `NGN NaN` for a pending line. It now
  calls the same `lineTotal()` as the checkout review.
- **P2** — plain finger-food rows and the Chin Chin size chips baked their
  price into the markup with no repaint hook, so an owner price change
  never reached them. Every row now exposes `syncPrice()`.
- **P3** — committed soup/rice lines snapshotted `unitPrice` at Add time,
  so a price landing after render left the cart stale while the invoice
  charged the new figure. Cart lines now re-resolve on every read
  (`soupEntryPrice`/`riceEntryPrice`); the snapshot is only the
  pre-catalogue fallback. This also fixes restored carts.
- **P4** — one pending policy for every category. Once the catalogue has
  loaded it is authoritative: a key it lacks becomes a pending line
  ("Price via WhatsApp", invoiced `p: null`), never the baked-in constant,
  which may be a price the owner has since changed. A *failed* fetch is
  the one exception — the constants stay, so the site is usable offline.
  A soup with no catalogue price is now orderable like every other
  category instead of blocking Add.
- **P5** — `/prices` lists categories and caps each listing at 40 keys
  (cake keys accumulate, so a flat list would outgrow a Telegram
  message); the `/update-price` hint names it instead of a raw API URL.

`lineTotal`/`lineAmount` moved from `index.js` to `config.js` so the page
and the tests share one definition of what a line costs.
**Tests:** `test-live-prices` → 45/45, covering late responses, restored
carts, price changes after add, missing catalogue entries, failed
requests, and menu/cart/checkout/WhatsApp/invoice agreeing on one price.

> ✅ **Closed by R3.4c** (below): every menu line now carries its
> catalogue key, and the Worker prices it from the catalogue. The client's
> `p` is only a fallback for lines with no key — cake lines (priced by
> `spec_key`) and pages cached before R3.4c.

---

## R3.4a — a repeat cake prices itself

**2026-11-13.** Files: `worker/index.js`, `tools/test-catalogue-price.mjs`
(new).

- **Server-side, not a client overlay.** The plan's R3.4 step 2 had the site
  fetching `/api/prices` and overlaying menu prices. For *cake* pricing that
  would put the price back in the browser; the spec's own security section
  says the client never sends a price the server trusts. So
  `priceCakeFromCatalogue()` runs inside `handleCreateOrder`: it reads
  `cake:<specKey>` from `product_prices` and prices the line from that row.
  Steps 1–3 of the plan still apply to the **displayed** menu (R3.4b).
- **Only `p: null` lines** are touched — a price already on a line came from
  somewhere a human meant.
- **Only cake orders.** The guard is on `orderType`, not the spec key: the
  first test run showed a Catering order carrying a spec key would have been
  priced from the cake catalogue. `orderType` is now clipped once and shared
  by the match and the insert.
- **Failure is pending, never a guessed price.** A D1 error logs and leaves
  the line unpriced; the order still succeeds.
- **Stored consistency.** `linesJson` is re-serialised after pricing and used
  for both `orders.lines_json` and invoice version 1, so the stored lines and
  the stored total describe the same document (P-4).
- **Multi-cake orders stay pending** — same one-key-per-order limit as R3.2.

Verified: `test-catalogue-price` 16/16 — match prices and goes `priced`;
unknown spec, no spec key, thrown D1 read, an already-priced line, and a
non-cake order all stay unpriced; the catalogue is never queried without a
spec key. `test-bot` 44/44, `test-invoice` 31/31, `test-spec-key` 24/24,
`node --check` clean.

---

## R3.3 — `/update-price` + `/prices`

**2026-11-13.** Files: `worker/bot.js`, `worker/index.js`,
`tools/test-bot.mjs`.

- **Owner gate is chat-id based** — `isOwnerChat(env, chatId)` in `bot.js`
  reads `TELEGRAM_OWNER_CHAT_IDS` through the existing
  `parseInvoiceChatIds()`. An unset list means **nobody** is owner. A chat
  in `TELEGRAM_INVOICE_CHAT_IDS` only is refused (spec §8: the invoice tier
  prices one order; only the owner changes what every order costs).
- **Refused before any D1 read.** A non-owner's `/update-price` writes
  nothing and reads no catalogue. The gate runs again on the parked `price`
  step, so a chat removed from the owner list mid-conversation loses it.
- **One-shot grammar** — `/update-price <key> <price>`, optionally the
  familiar `<n> =` prefix, `NGN`/commas accepted. A bare `/update-price`
  shows the catalogue and waits. `/prices` lists `key  NGN x` for copying.
- **The key is looked up, never created.** A typo replies
  `No catalogue item "..." - nothing was changed.` rather than inserting a
  second row that would leave the real price silently unchanged.
- **Unchanged price** says so and writes nothing. Writes are audited as
  `catalogue-price` with old/new values.
- **Not supported on purpose:** cake keys (`cake:<spec_key>`) contain
  spaces, so the parser refuses them instead of guessing which word is the
  key. Cake catalogue prices are set by `/edit-invoice`'s **Save price**,
  which already builds the key server-side ([worker/index.js:718](worker/index.js)).

Verified: `node --check` clean on both worker files; `test-bot` 44/44 (16
new: parser grammar + ceiling, owner gate incl. unset list); stub-D1 probe of
the real webhook — owner write emits exactly `UPDATE product_prices` +
`audit_log`, non-owner emits **no catalogue read and no write**, unknown key
looks up and stops, bare command parks state. `test-invoice` 31/31 and
`test-spec-key` 24/24 still pass.

---

## R3.2 — cake spec key

**2026-11-13.** Files: `config.js`, `index.js`, `worker/bot.js`,
`tools/test-spec-key.mjs` (new).

- **`cakeSpecKey(cake)`** exists twice — `config.js` (what the site sends)
  and `worker/bot.js` (what the Worker looks up). They cannot import each
  other (config.js is a plain `<script>`), so `test-spec-key.mjs` evaluates
  the real `config.js` source and asserts both copies return the same thing
  for the same cake.
- **In the key:** `tiersLabel`, sorted `tierDetails` (inches + layers),
  `flavor`, `finish`, each `normKey`-ed (trim, collapse, lowercase) and
  `|`-joined.
- **Out of the key, deliberately:** `occasion` (price-neutral — spec §5.1
  says so and the owner confirmed 2026-11-13; the plan's snippet omitted it
  only because the caller never passed one), plus `date`, `inscription` and
  `design` — per-order free text that would make every cake unique.
- **`null` for custom and Wedding** — they are hand-quoted, so they must
  never match a catalogue price. Custom is detected from `tiersLabel`
  beginning `Custom` because only `specKey` (not `isCustom`) reaches the
  Worker.
- **Wiring:** `specKey` is added to the `logOrder()` body in
  `finalizeCakeOrder()` and in the combined checkout, **only when the order
  contains exactly one cake** — `orders.spec_key` is a single column and two
  cakes have no single configuration. Both paths pass `null` otherwise, so
  nothing changes for mixed orders.
- Measured keys land around 90-110 chars (under the Worker's 200-char clip),
  e.g. `2 tiers, 3 tiers|step 0: 8" — 2 layers ; step 1: 10" — 3 layers|vanilla|fondant`.

**Still not auto-priced.** `handleCreateOrder` stores `spec_key` but never
reads `product_prices` to price the line — cake lines still arrive `p: null`
and stay pending until a human prices them. Closing that gap belongs with
R3.4/R3.5, not R3.2.

Verified: `node --check` clean on all four changed files; `test-spec-key`
24/24; `test-bot` 28/28; `test-invoice` 31/31; a stub-D1 probe confirms the
key reaches the `orders` INSERT's `spec_key` column and that an absent or
`null` key stores ``NULL``.

---

## R3.1 — `GET /api/prices` + catalogue seed

**2026-11-13.** Files: `worker/index.js`, `worker/seed-prices.sql` (new).

- `handlePrices(env)` returns `{ prices: { "<item_key>": price }, updated_at }`
  via `jsonCached` (public, `max-age=60`). `updated_at` is the newest row, or
  `null` when the catalogue is empty — an empty catalogue is a valid 200, not
  an error, so the site's overlay can no-op.
- **Registered above the `/api/` auth gate** ([worker/index.js:1349](worker/index.js)),
  next to `/api/gallery` — the landmine the TODO warned about. Placing it
  below would 401 every anonymous visitor.
- `seed-prices.sql` — 34 `INSERT OR IGNORE` rows mirroring the hardcoded
  menu: 10 soups (`<id>:<5L|10L>`), 12 rice (`<id>:<type>-<style>` — rice
  varies on both dimensions, so both are keyed), 4 proteins, 8 finger foods.
  Re-runnable; never clobbers an owner-changed price.
- **Nothing user-visible changes yet.** The site still uses its baked-in
  arrays; R3.4 is what reads this endpoint.

**Not applied to any database.** The seed needs
`npx wrangler d1 execute la-creme-orders --file=worker/seed-prices.sql`
(remote), after `schema-bot.sql` if that table doesn't exist there yet.

Verified: `node --check worker/index.js` clean; stub-D1 probe 5/5 —
200 + cache header, prices map, newest `updated_at`, empty catalogue returns
`{}` / `null`.

---

## Phase 1 — P-3: business details come from D1, placeholders never print

**2026-11-11.** Completes the Phase 1 pass (P-1, P-2, P-4 were already
committed). Files: `worker/invoice.js`, `worker/index.js`,
`tools/test-invoice.mjs` (new).

- **`DEFAULT_SETTINGS` is now explicitly development defaults.** The four
  placeholder values are listed in `PLACEHOLDER_VALUES`; `resolveSettings()`
  merges D1 over the defaults and blanks any value that is empty *or* still a
  placeholder, returning `{ settings, missing }`.
- **`loadSettings(env)`** reads the six `SETTING_KEYS` from D1 `settings` with
  an explicit `IN (...)` list — the table also holds `tg_update:*` dedupe rows,
  and a blanket `SELECT` would drag them in. It never throws: a failed read
  logs and returns `{}`, so the invoice still renders from the defaults.
- **The stamp.** When anything is missing, `renderInvoice` draws a red band
  under the pending band: `BUSINESS DETAILS NOT CONFIGURED - DO NOT SEND TO
  CUSTOMER`. The rep forwards the PDF by hand, so the warning travels with it.
- **Both render paths wired.** `sendInvoiceToCompany` (order create, revise,
  approve) and `handleGetInvoice` (admin download) both load settings, so the
  Telegram copy and the admin download are the same document.
- **`ALLOW_PLACEHOLDER_SETTINGS=true`** prints the placeholders for local
  layout work, but only when `ENVIRONMENT=development` too. `wrangler.toml`
  sets `ENVIRONMENT="production"` for the deployed Worker, so the flag is
  inert there even if set by mistake; an unset `ENVIRONMENT` counts as
  production. Local dev opts in via the gitignored `.dev.vars`.
- **Tests:** `node tools/test-invoice.mjs` → 27/27 (resolveSettings,
  loadSettings against a fake D1, and the stamp present/absent in the rendered
  PDF). `node tools/test-bot.mjs` → 28/28 unchanged. `verify-r1.mjs` still
  passes all checks.

**Still owner-supplied:** the real bank name, account number, phone and
address. Until they are inserted into D1 `settings`, every invoice carries the
stamp — which is the intended behaviour, not a bug.

---

## Phase 1 — P-5: caption interpolation escaped (B-7)

**2026-11-11.** Files: `gallery.js`, `index.js`.

The B-7 finding listed three raw caption interpolations; the fix found a
fourth. All four now go through `escapeHtml()`:

- `gallery.js:308` — tile image `alt`.
- `gallery.js:320` — `gi-cap` div.
- `gallery.js:666` — lightbox image `alt` (missed by the first sweep; the
  lightbox *caption* uses `textContent`, the image `alt` beside it did not).
- `index.js:332` — cake gallery modal `alt`.

`node --check` clean on both files. The server-side caption length cap stays
with G-1, where captions first become user input.

---

## Verification

### Phase 4 (headless Chrome probe, deleted afterwards)

Add hidden until size+protein · separate lines for Goat meat vs Fish · same
config folds 2+2 · cart total ₦150,000 · saved as array · both entries restored
on reload · remove and clear both correct · `node --check` clean.

### Phase 5 (headless Chrome probe, deleted afterwards)

- Clear button hidden with nothing selected — ✅
- After one real photo through `onFiles`: 1 prepared, 1 thumbnail, Clear and
  Send both visible, label "Send 1 photo" — ✅
- Clear: 0 prepared, 0 thumbnails, Clear+Send hidden, pick button and hints
  reset, **category preserved** — ✅
- Clear mid-resize (2 photos queued, cleared immediately): nothing
  repopulates, 0 prepared, 0 thumbnails — ✅
- Clear during an in-flight send (stubbed request): disabled, click does
  nothing, prepared/thumbnails untouched, re-enabled after the send finishes,
  "1 photo sent ✅" shown — ✅
- Admin session: no entry → login shown; valid entry → token returned;
  expired → `null` and entry removed; garbage JSON → `null` and entry removed;
  a valid written entry is what boot reads — ✅
- `node --check upload.js` and `node --check admin.js` clean — ✅

### Phase 6 (headless Chrome probes, deleted afterwards)

Gallery — every category that has photos gets the right label + href
(Wedding/Traditional→Wedding, Anniversary→Anniversary, the four "for …" tabs
and the "Cakes" catch-all→Birthday, Small Chops→finger-foods,
Catering & Events→catering); an unrouted category hides the button.

Arrivals — `?order=cake&occasion=Wedding|Anniversary|Birthday` preselects that
occasion; `occasion=Nope` leaves the select untouched instead of blanking it;
`?order=smallchops` pulses a finger-food row; `?order=catering` pulses the
booking card; every arrival clears the query and keeps the hash; a plain load
shows no toast and no pulse; the cart still initialises.

Booking card — layout measured at 1258 / 738 / 512px (wraps, button full width
when narrow, no page overflow) and screenshotted in isolation at 1280 / 560.
`node --check index.js` and `node --check gallery.js` clean.

Checkout carry-over — cake (Delivery + "12 Iyala Street, Uyo") plus a finger-food
line: chip preselected, address copied, note shown. Switching to Pickup hides
the note and clears the address. Reopening keeps the customer's own Pickup.
Cake form set to Pickup carries Pickup. No cake → nothing carried. Cake in cart
with no delivery answered → nothing carried, plain ask. Submitting that order
composes a message with the carried `Delivery, 12 Iyala Street, Uyo` line, the
`*Cakes*` block and the finger-food lines.

Not exercised: real touch hardware, a true 390px viewport (headless Chrome on
Windows bottoms out around 497px), and an actual WhatsApp send.

### Regression sweep — 2026-11-06 (50/50 passed)

Playwright against a local static server (`python -m http.server 8080`), with the
orders worker **mocked** so nothing touched production. Script was a throwaway in
the temp dir, not committed.

- **Carts agree** — FF + soup + rice + protein + cake all add; badge (6) and
  total (₦38,000) match the line items; all three sections render in the dropdown.
- **Restore** — badge, total and every line survive a reload; `lcCartV1` holds
  soups/rice/cake as arrays.
- **WhatsApp message** — captured the real `wa.me` payload: `*Finger Foods*`,
  `*Catering*`, `*Cakes*` blocks, order number, event details, delivery, total.
- **Checkout** — review lines and total match the cart exactly.
- **Modal close paths** — cake gallery (X / Escape / backdrop), lightbox
  (X / Escape), cart dropdown (Escape) all close.
- **Gallery** — 10 filter tabs, every one yields cards; Order button routes
  correctly (`?order=cake&occasion=Birthday#cakes`).
- **Upload** — Clear appears only when staged, empties thumbnails, hides itself,
  preserves category.
- **Admin** — login stores a 15-min session; expiry re-asks and removes the entry.
- **No JS errors** on any page.

Not exercised: a real WhatsApp send, real touch hardware, a true 390px viewport,
and the worker's real endpoints (mocked).

### INV-1 — 2026-11-07 (real worker under `wrangler dev`, local D1)

Nothing touched production. Telegram was stubbed with a fake bot token, so the
calls fired and failed harmlessly; the log proved the fan-out.

- **Schema** — `lines_json` + `revised` present; re-running `schema-invoice.sql`
  errors `duplicate column name` as documented.
- **Helpers** — 11 assertions on `validateLines` / `parseStoredLines` /
  `parseInvoiceChatIds` (null, non-array, empty description, fractional qty,
  negative price, `p: null`, 150→100 cap, bad JSON fallback, dedupe) — PASS.
- **PDF structure** — a throwaway parser read the xref table and confirmed every
  offset lands on its `<n> 0 obj`, `Size` matches the xref count, header and
  `%%EOF` present. Five cases: plain, cake-only, mixed priced/unpriced, 100
  lines (3 pages), revised. All PASS.
- **Endpoint** — order → `lines_json` stored → `GET /api/orders/:no/invoice`
  returns `application/pdf` with the right filename; no token → 401; unknown
  order → 404; hand-edited `lines_json` → 200 with the bad line dropped; row
  with `lines_json IS NULL` → renders from `items` as unpriced.
- **Body budget** — a 200-line / 25,612-byte order is accepted (`{"ok":true}`),
  stored as 100 lines / 6,693 bytes. No 413.
- **Telegram** — two chat ids → exactly two `sendDocument` attempts; the same
  order number posted again → zero (the `meta.changes` guard); unset
  `TELEGRAM_INVOICE_CHAT_IDS` → `invoice: … is not set`, order still `ok`; an
  upload still logs a `sendMessage` attempt, not a document.
- **Admin (real browser, Playwright)** — signed in, selected an order, clicked
  **Invoice**: downloaded `LaCreme-Invoice-20261106-101500123-AB.pdf`, 1,804
  bytes, structurally valid, correct content. Bogus token → signed out to the
  login view. **Print receipt** still populates the receipt element.
- `node --check` clean on `config.js`, `index.js`, `admin.js`,
  `worker/index.js`, `worker/invoice.js`.

Not exercised: a real Telegram delivery (stub token), a real deploy, and any
human judgement of the invoice layout.

---

## Repo state

- `2cdf261` — Phases 1–5 across nine files (546 insertions, 142 deletions).
  They share one commit because the hunks interleave inside the same files,
  so a per-phase split would need hand-built partial patches.
- `5f08ff6` — these two tracking docs.
- `8cc0704` — Phase 6 across `gallery.html`, `gallery.js`, `index.html`,
  `index.js`, `index.css`. **Pushed 2026-11-11:** the whole branch went to
  `origin` as `invoice-revision`, tracking `origin/invoice-revision`.
  `main` was not touched and remains behind.
- INV-1 — `worker/invoice.js`, `worker/schema-invoice.sql`,
  `worker/index.js`, `config.js`, `index.js`, `admin.js`, `worker/README.md`,
  plus the spec, the plan and these two tracking docs.
- `aec192d` (R1), `a3786ee` (R2.1), `93c13a9` (R2.2), `025b3cf` (R2.3),
  `3b854d3` (invoice fix), `654f347` (R2.4) — the invoice-revision phases.
- `2c19ce8` — the letterhead/ASCII pass in `worker/invoice.js`,
  `worker/bot.js`, `worker/index.js`, `tools/demo-bot.mjs`,
  `tools/test-bot.mjs`, plus `CLAUDE.md` and these two tracking docs.
- `1be2df2` (R2.5 badge), `fd19c7c` (R2.6 sweep). Working tree is clean
  apart from local scratch, now gitignored (`sample-*.pdf`,
  `verify-r1.mjs`, `.demo-dev.log`).
- R3, six commits on `invoice-revision`, **not pushed**: `954e0cf`
  (R3.1+R3.3), `34eadad` (R3.2), `e56a53a` (R3.4a), `0d91c73` (R3.4b),
  `3a4b26f` (R3.4b docs), `0e55bb6` (R3.4c). R3.1 and R3.3 share a commit
  because their worker hunks interleave. `index.js` is committed with CRLF
  (`git hash-object -w --no-filters`) — staging it normally rewrites the
  whole file to LF and produces a 5,000-line diff.

---

## Not verified / known gaps

- ~~WhatsApp message composition was not captured end-to-end.~~ **Now
  captured** by `tools/test-browser.mjs` (R3.5): the `wa.me` text is read
  from the stubbed `window.open` and checked against the cart and the
  `/api/orders` body.
- The upload **send** itself was exercised against a stubbed `XMLHttpRequest`,
  not the real worker: Clear is confirmed disabled mid-flight, the click is a
  no-op, and it re-enables after `finish()`. No bytes were sent to R2.
- Admin login with a **real** token was not exercised against the worker; the
  probe tested the session-window logic only, to avoid poking production.
- Real touch hardware and a true 390px viewport were not exercised — headless
  Chrome on Windows has a ~497px minimum layout width.
- **INV-1 is not deployed and no secret is set.** `TELEGRAM_INVOICE_CHAT_IDS`
  must exist before a deploy or invoices are silently not delivered (the
  Worker log is the only trace). `schema-invoice.sql` must be run against the
  remote D1 as part of that deploy.
- **The invoice layout still has not been judged by a human.** Structure,
  pagination and text placement were checked numerically; the new letterhead
  (name on the order-number line) has only been measured, not looked at on
  screen. The spec expects the owner to want changes.
- ~~`DEFAULT_SETTINGS` placeholders print on every invoice.~~ **Superseded
  by P-3**: `loadSettings()` reads D1 `settings`, placeholders are blanked,
  and the invoice stamps DO NOT SEND. **BUG-2 is still open** — the owner
  has not yet supplied `company_phone`, `company_address`, `bank_name` or
  `account_number`, so every invoice still stamps DO NOT SEND.
- **Nothing is deployed.** The Worker, the seed and the site changes are
  local only; no remote D1 was touched, nothing was pushed, and no real
  Telegram delivery has been exercised (stub token throughout).
- The PDF renderer's text widths are an approximation (three character
  classes), used only for right-alignment and truncation. Exact AFM metrics
  were not worth 200 numbers; a very wide glyph could sit a point or two off.
