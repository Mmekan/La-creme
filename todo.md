# TODO — La Crème

**Updated:** 2026-11-10 (after R2.4 + invoice letterhead/ASCII pass)
Companion to `projectstate.md`.

---

## Do first

- [x] **Commit Phases 1–5.** Landed as `2cdf261` (one commit — the phase hunks
      interleave inside the same files, so a clean split needs partial patches).
      Tracking docs in `5f08ff6`. Nothing pushed.
- [ ] **Confirm the password question with the owner.** The upload page has
      no password to remove — the gate is the admin page, and its re-ask window
      is now 15 minutes. If she meant a different gate, say which.
- [x] **Clear selection mid-send.** Verified against a stubbed request: the
      button is disabled during the send, the click is a no-op, and it
      re-enables afterwards. A real-device pass is still nice to have but no
      longer blocking.
- [ ] **Set `TELEGRAM_INVOICE_CHAT_IDS` before deploying INV-1.** Without it
      every order still logs and the site behaves normally, but **no invoice
      is delivered** — the only trace is a line in the Worker log. Needs the
      sales rep's Telegram chat id (she messages Mekabot, you read the id).
      `npx wrangler secret put TELEGRAM_INVOICE_CHAT_IDS` — comma-separated.
- [ ] **Get the owner to look at one invoice.** The layout is a first draft
      built to be changed: header, customer block, line table, total, footer.
      Everything is positioned in `renderInvoice()` in `worker/invoice.js`, so
      a change is one function, not a rewrite. Nothing has been judged by a
      human eye yet. As of 2026-11-10 the letterhead is `La'Creme
      Confectionery` on the order-number line — still measured, not eyeballed.
- [ ] **Replace the placeholder bank details before any invoice goes out.**
      `DEFAULT_SETTINGS` in `worker/invoice.js` currently prints
      `Demo Bank` / `0123456789` on every invoice (the D1 `settings` table is
      never read). Either edit the constants or wire `settings` through.
- [ ] **Commit the 2026-11-10 pass.** `worker/invoice.js`, `worker/bot.js`,
      `worker/index.js`, `tools/demo-bot.mjs`, `tools/test-bot.mjs`. Leave
      `sample-*.pdf`, `verify-r1.mjs`, `.demo-dev.log` out.

## Next — Phase 6 (#8): order from a gallery image

Defined 2026-11-05, in the owner's words: in the gallery, an **Order** button
that takes the viewer to the menu for whatever they're looking at, preselects
where it can, and says what to do next.

### 6a — Order CTA in the gallery lightbox

- [x] Add an **Order** button to the lightbox (next to the caption), labelled
      per the image's category — "Order this cake", "Order Small Chops".
- [x] Map from the image's `category` (the item's own, not just the active
      filter — the "Cakes" catch-all has no tab of its own):

      Wedding Cakes, Traditional Wedding Cakes → cakes, occasion **Wedding**
      Anniversary                              → cakes, occasion **Anniversary**
      Cakes, Cakes for Boys/Girls/Men/Women    → cakes, occasion **Birthday**
      Small Chops                              → finger-foods
      Catering & Events                        → catering, "Book your event"

- [x] Navigate cross-page to `index.html` with a small query signal
      (e.g. `?order=cake&occasion=Birthday#cakes`).
- [x] On arrival, `index.js` reads that signal once, sets the occasion select,
      scrolls the section into view, pulses the relevant row, and opens its
      quantity/selection controls.
- [x] Toasts on arrival:
      - cake → **"How would you like the cake?"**
      - small chops → **"Complete your small chops order."**
      - catering → **"Planning an event? Tap Book Event Catering below."**
- [x] Clear the query signal after use so a refresh doesn't re-fire the toast
      or re-force the occasion.

### 6c — Book catering for an event

Asked for 2026-11-05: besides ordering soups and rice in bulk, there should be
a button for a host who wants us to plan and price the whole spread.

- [x] **Book Event Catering** button in the `#catering` section, under the intro.
- [x] Opens WhatsApp with the four blanks we can't quote without — event type,
      date, guests, venue — pre-typed for the customer to fill in.
- [x] A Catering & Events photo's Order button lands on this card (scrolled to
      centre, pulsing) rather than the soup list.

### 6b — Gallery nav

- [x] Replace the dead "Gallery" link in the gallery page's nav with **Home**
      (was `opacity:.6; pointer-events:none`).

### Open questions

- ~~Where do **Catering & Events** photos send people?~~ Answered 2026-11-05:
  the catering section, because that's where the event booking button lives.
- Should the Order button also sit on the filter bar (order "this category")
  or only in the lightbox (order "this photo")? Still open — built lightbox-only.

### 6d — Delivery step in the combined checkout

Reported 2026-11-05: with a cake in the order, "Checkout All" asked for
Delivery/Pickup and the address again, though the cake form had just collected
them. The step stays — it's the order's one delivery line — it just shouldn't
start blank.

- [x] Preselect the cake order's delivery and copy its address into the
      checkout when a cake is in the cart.
- [x] Say where it came from, so it's a confirm-or-change: *"Carried over from
      your cake order, address included…"*
- [x] Hide the hint as soon as the customer picks a chip themselves.
- [x] Leave the old behaviour alone when there's no cake, or when the cake form
      has no delivery answer yet.

## Then — final regression sweep

- [x] Desktop + mobile pass over: cart restore, WhatsApp messages, gallery
      filters, every modal's close paths, uploads, and admin approval.
      **2026-11-06 — 50/50 passed** (Playwright, worker mocked). See
      `projectstate.md`.
- [x] Check the cake / finger-food / catering carts still agree after the soup
      model change (totals, badge count, checkout review). ✅
- [x] Check the admin flow end-to-end: password → 15-minute window → 401
      re-prompt after the server token expires. ✅ (session window verified;
      the 401 path itself still needs a real token against the worker.)

---

## Done (recent)

- [x] **2026-11-10 — R2.5 admin price badge** (`1be2df2`): PRICING/APPROVED on
      the order card and detail panel; priced stays silent.
- [x] **2026-11-10 — R2.6 verification sweep.** Pages 27/27, Worker+bot 23/24
      (the 1 is a wrong expectation, not a defect). Full report:
      `.superpowers/ponytail-report-2026-11-10.md`.
- [x] **2026-11-10 — NGN everywhere, ASCII-only bot/invoice text.** `money()`
      prints `NGN 38,000`; em dashes/arrows/`×`/bullets/emoji removed from
      user-facing strings. 28/28 bot tests pass.
- [x] **2026-11-10 — invoice letterhead.** `La'Creme Confectionery` on the
      order-number line, left-aligned with the logo; every `DEFAULT_SETTINGS`
      field filled so the payment block renders.
- [x] **2026-11-10 — demo harness.** `tools/demo-bot.mjs` now reads
      `DEMO_SECRET`; it was hardcoding `s3cret` and every update 404'd.
- [x] **R2.4 — `/edit-invoice` + `/approve`** (`654f347`).
- [x] Phase 4 — soups use the rice cart mechanism (separate lines per protein).
- [x] Phase 6 — gallery Order button, menu arrivals, event-catering button.
- [x] Checkout carries the cake order's delivery instead of re-asking blank.
- [x] Phase 5 — upload **Clear selection** button.
- [x] Admin password asked once per 15 minutes instead of every new tab.

## Parked

- Removing the upload password — there isn't one. Re-confirm what was meant
  before changing any gate; the unlisted URL is currently the only guard.

---

## Later — recorded 2026-11-06

### BUG-1 (deferred): mobile selector tap misfires

Reported 2026-11-06, saved for a later review pass — **not diagnosed yet**,
nothing below is confirmed.

- Symptom: tapping the size-plate/tray selectors or quantity selectors on
  mobile shows a faint blue rectangle *slightly below* the tapped spot, and
  the tap does nothing (no selection).
- Suspects: mobile tap-highlight painting offset from the real hit area
  (`-webkit-tap-highlight-color` on `body` vs per-chip), a transformed/
  scaled ancestor shifting visual vs layout position, or an overlay
  swallowing the tap. Could also be `:active` vs `:hover` style leakage.
- Review when taken up: reproduce on real touch hardware (not headless —
  headless Chrome floors at ~497px and can't do real taps), check which
  selector rows are affected (soup size? rice type/style? qty steppers?),
  inspect computed `transform`/`zoom`/positioning ancestors of the chips,
  and confirm whether the blue box is the tap highlight or a focus ring.
- Files likely involved: `index.css` (chip/qty styles, tap highlight),
  `index.js` (`buildSoupRow`, `buildRiceRow` — chip listeners).

### INV — Invoice workflow (Telegram bot + PDF invoice)

Owner's flow, 2026-11-06. **Status: INV-1 built 2026-11-07. The plan then
became R1–R3; R1 and R2.1–R2.4 are done (`654f347`). R2.5, R2.6 and R3 are
next.** Each phase depends on the one before it.
Spec: [docs/superpowers/specs/2026-11-06-invoice-workflow-design.md](docs/superpowers/specs/2026-11-06-invoice-workflow-design.md)
Plan: [docs/superpowers/plans/2026-11-06-invoice-inv1.md](docs/superpowers/plans/2026-11-06-invoice-inv1.md)

**Next step:** **R3** — live catalogue prices (`/update-price` is the bot
command that lands with it; it is a stub today). R2.5 and the R2.6 sweep are
done. Before writing R3, note the auth-gate ordering landmine in the ponytail
report: `GET /api/prices` must be registered **above** the `/api/` auth gate
or it 401s for everyone. Two things only the owner can settle (see "Do first"):
the invoice layout review, and replacing the placeholder bank details.

> Customer places an order → order text notification on company
> WhatsApp (as today) → **bot receives the PDF/image invoice** → **bot
> forwards it to company Telegram** → sales rep downloads and sends it
> via WhatsApp to the customer. If the order is altered in chat, the rep
> types **/edit-invoice** (or taps the button) on Telegram → bot asks for
> the **order number** → she pastes it → bot asks for the **price/item
> change** in the standard format → bot sends the correction **to the
> site** so the **admin panel tallies** → site resends the updated PDF →
> invoice goes to customer → payment confirmed.

Decisions already made (from discussion):

- **WhatsApp delivery of the PDF is via a human relay, not an API.**
  `wa.me` links cannot attach files; the WhatsApp Cloud API would need a
  Meta business account, template approval, and would take the business
  number out of the normal app. So: automation ends at company Telegram;
  the sales rep forwards to the customer on WhatsApp.
- **Telegram first.** PDF lands in the bot/company Telegram — no Meta
  approval, no cost, bot needed anyway for Phase A prices.
- **Invoice first (Phase B), prices second (Phase A).** Invoice builds
  against today's hardcoded prices; Phase A makes prices live-editable
  later. Accept: invoices may show stale prices until A lands.

Facts grounding the plan:

- Orders already log to D1 (`worker/schema.sql` → `orders` table:
  `order_number`, `items` text blob, `total` text, `status` in
  New/Confirmed/In Progress/Ready/Delivered/Cancelled, plus
  name/phone/delivery/event fields). Admin already lists/searches/orders
  and PATCHes status. No line-item structure, no payment state.
- Worker already talks to Telegram (`sendTelegram` → `sendMessage`,
  token/chat from secrets `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`).
  Used today for upload notifications only (one per batch, fire-and-forget
  via `ctx.waitUntil`).
- Admin already has a `printReceipt` text receipt (`admin.js`) — the
  invoice is its formal, itemised, sendable successor, not a new concept.
- Order number format: `YYYYMMDD-HHMMSSmmm-Initials` (`generateOrderNumber`
  in `config.js`) — already unique per checkout, usable as the bot's lookup
  key with no new identifier scheme.

#### Phase INV-1 — PDF invoice on every order — ✅ done 2026-11-07

Goal: each placed order produces a PDF invoice that lands in company
Telegram automatically, alongside today's WhatsApp text notification.

- [x] **Structured line items.** `lines: [{d, q, p}]` added to both
      `logOrder` call sites via `invoiceLines()` in `config.js`; `p: null`
      means "price via WhatsApp" (cakes). Stored in the new
      `orders.lines_json` column. The `items` text blob is still written and
      still what the admin list and `printReceipt` render from.
- [x] **PDF generation in the worker.** `worker/invoice.js` — hand-rolled,
      zero dependencies, base-14 fonts, uncompressed content streams,
      paginates at ~34 rows. `NGN 38,000`, never `₦` (no naira glyph).
- [x] **Telegram document send.** `sendDocument` (multipart) fires at
      order-create via `ctx.waitUntil`, one call per chat id in
      `TELEGRAM_INVOICE_CHAT_IDS`, with the order summary as the caption.
      Upload alerts still go to `TELEGRAM_CHAT_ID` — verified unchanged.
- [x] **Admin parity.** **Invoice** button on the order card, next to
      *Print receipt* (which is untouched). Downloads the same bytes.
- [x] **Verify:** order → `lines_json` stored → PDF structurally valid
      (xref offsets parsed, not just grepped) → two `sendDocument` attempts
      for two chat ids, zero on a duplicate order number → admin button
      downloads a valid PDF in a real browser → 401 signs out → old rows
      with `lines_json IS NULL` still render from `items`.

**Not verified:** the invoice *looks* right. Structure and text placement
were checked numerically; nobody has opened one and judged the layout. The
spec calls the layout a first draft the owner will want changed.

#### Phase INV-2 — /edit-invoice on Telegram

Goal: sales rep corrects price/items from her phone; site and admin
panel tally; updated PDF re-issued.

1. **Bot webhook.** Worker gains a Telegram webhook endpoint
   (`POST /api/telegram`, secret path) receiving updates; commands:
   `/edit-invoice` (button or typed). Conversation state per chat in D1
   (new small table: `chat_id → step, order_number`) since the worker is
   stateless between updates.
2. **Lookup by order number.** Rep pastes the number; worker fetches the
   order from D1, shows current lines, asks for the change in a fixed
   format (define at build: e.g. `line 2 price 4500` / `add 3 × …`).
3. **Correction writes back to the site.** Worker PATCHes the order row
   (new endpoint or extended `handleUpdateOrder`: append/replace
   structured lines, recompute total, stamp a `revised` marker + reason).
   Admin panel re-renders from the same row, so it tallies by construction.
4. **Re-issue.** Worker regenerates the PDF (same renderer as INV-1)
   and sends the updated document to company Telegram
   ("Revised invoice for <order no> — v2").
5. **Verify:** conversation happy path + bad order number + malformed
   change + double-submit; admin shows corrected lines/total; revised PDF
   matches; idempotency (same edit twice = one revision, or explicit
   guard).

#### Phase INV-3 — live prices via Telegram (deferred, after B works)

The earlier `/adjust-price` idea: move menu prices from hardcoded
`index.js` arrays into D1, serve via worker, bot writes to D1. Only
after the invoice flow is proven — it re-plumbs every price on the
site (menu arrays + three order builders + cart totals + checkout).
Recorded here so the invoice's structured lines are designed to read
from the same price source when it arrives.
