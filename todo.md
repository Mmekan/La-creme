# TODO — La Crème

**Updated:** 2026-11-10 (build plan agreed; no builds yet)
Companion to `projectstate.md`.

---

## Build plan — agreed 2026-11-10 (standing reference, no builds yet)

**What we are achieving, in plain words:** a customer gets a priced
response fast; the rep prices and re-issues invoices from her phone;
every order knows where it landed in the day's queue; adding a second
phone number later is a settings change, not a build. What we are NOT
doing: no automatic WhatsApp sending from the site — `wa.me` links
prepare the message, a human presses send.

**Agreed facts (owner, 2026-11-10):**

- Company line: `08066835713` → international `2348066835713`.
  Current site number stays: `CONFIG.whatsappNumber = '2348066556677'`.
  Provision: both the Telegram whitelist and the WhatsApp numbers move
  into the D1 `settings` table, so adding a third number is a settings
  edit, not a deploy.
- Custom cakes: the moment an order lands on custom, it is quoted
  separately — never a catalogue key, never a site price, `/approve`
  keeps refusing until a human prices that specific order. Explicit
  "Custom design — quoted separately" choice in the cake form (not
  inferred from free text); stored as `is_custom` on the order.
- Telegram: `@Lacremeuyobot` is admin. Two tiers — admin tier (bot +
  company-line chat) can run `/update-price` and catalogue commands;
  whitelist tier (rep, future staff, chatting with the bot) can edit
  per-order invoice prices and print invoices. A group chat must NOT
  inherit admin rights by membership.
- Daily counter: each order for the day gets "First order of the day",
  "Thirteenth order today", "Nineteenth order today", etc. in the
  Telegram caption + WhatsApp message (NOT in the PDF — wrong register
  for a formal document). Day boundary: midnight WAT. Open: count all
  orders, or exclude cancelled ones.
- Cake pricing model: spec-key pricing (price per configuration in
  `product_prices`), not a named-cake menu. An unpriced spec falls
  through to "price via WhatsApp", same as today. Catalogue edits never
  rewrite existing orders (each keeps its `lines_json` snapshot).
  `/api/prices` cache is `max-age=60`, so site prices lag catalogue
  edits by up to a minute.

**Phases (in order):**

- **0 — Freeze the truth.** Fix `projectstate.md` drift ("no remote" x2,
  HEAD `1be2df2` vs actual `fd19c7c`), check landed boxes in `todo.md`,
  push `invoice-revision`, `.gitignore` stray PDFs.
- **1 — Invoice safety (B-1, B-2).** `loadSettings()` reads D1 `settings`,
  merges over `DEFAULT_SETTINGS`; placeholder bank fields stamp the PDF
  "PAYMENT DETAILS NOT CONFIGURED". Zero-recipient fallback: caption-only
  send to `TELEGRAM_CHAT_ID`.
- **2 — Numbers, recipients, counter (new info above).** Explicit custom
  flag + `is_custom`; two-tier Telegram auth; dual-WhatsApp UX (primary
  `wa.me` + one-tap business-line follow-up); indexed daily `COUNT` on
  `received_at` with WAT boundary.
- **3 — Deploy + prove (B-6).** Migrations on real D1, secrets, worker +
  site live, one genuine order end-to-end.
- **4 — BUG-1 mobile taps.** Instrumented page on her real device;
  fix what the rectangles say.
- **5 — G-2 "Latest" header.** One more `interstitials` break at the
  uploaded-vs-hardcoded boundary. Decide: cutoff (newest N vs window),
  filter behaviour; never render empty.
- **6 — Owner questions, one conversation.** Invoice eyeball review,
  password meaning, Order button on filter bar, counter wording,
  "Latest" vs "Most recent".
- **7 — R3 catalogue prices (last).** Anonymous-200 test for
  `GET /api/prices` FIRST, then register above the `/api/` auth gate
  (`worker/index.js:1247`). R3.2 spec key is load-bearing: wire
  `spec_key` through `finalizeCakeOrder`.
- **8 — G-1 captions (after deployed D1 + B-7).** Column → API →
  manifest → one-per-batch field on upload page → per-image override at
  admin approval. B-7 (`escapeHtml` at `gallery.js:307,320`) BEFORE
  any public caption path ships.

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
- [x] **Commit the 2026-11-10 pass.** Landed as `2c19ce8` (letterhead, NGN
      everywhere, ASCII-only bot text, demo harness). R2.6 sweep followed as
      `fd19c7c`. Scratch output (`sample-*.pdf`, `verify-r1.mjs`,
      `.demo-dev.log`) is now gitignored rather than left lying about.

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

---

## Gallery — captions + a "Latest" section (recorded 2026-11-10)

Two owner requests, both on the **gallery page**. Neither is a regression —
they are new work. They are numbered alongside BUG-1 so the phase plan keeps
one list.

### B-7 (blocker for G-1): caption interpolation is unescaped

`gallery.js:307` and `gallery.js:320` build tile HTML with `innerHTML` and
interpolate `${item.caption}` raw — including into an `alt="${item.caption}"`
attribute. Today every caption comes from `gallery-data.js`, authored by us,
so it is safe.

The moment captions can come from an upload (G-1), they come from the
**public, unauthenticated** `POST /api/upload`. A caption containing
`" onerror="...` breaks out of that attribute. Fix it before G-1, not after:
escape at both sites with the existing `escapeHtml()` (`config.js`) and cap
the length server-side. The lightbox caption already uses `textContent`
(`gallery.js:668`) and is not affected.

### G-1 — captions for uploaded photos

Owner's words: *"let there be a space to add a caption to the image, but the
challenge is that if the images are multiple, captioning might be a hiccup."*

The pipeline is already caption-shaped: `handleGallery()` returns
`caption: ''` on every manifest item (`worker/index.js:1063`), and the gallery
already renders `caption` for hardcoded photos. What is missing is a way to
**set** it.

- [ ] Schema: `ALTER TABLE upload_items ADD COLUMN caption TEXT`
      (`schema-media.sql`). Re-running it errors `duplicate column name` —
      that is the expected outcome, same as `schema-invoice.sql`.
- [ ] `POST /api/upload`: accept `caption`, cap it (~120 chars), store it.
- [ ] `handleGallery()`: `SELECT i.caption` and return it.
- [ ] Batch caption on the upload page — **one field for the whole batch**,
      not one per photo. The schema already forces one category per batch,
      so a batch is already semantically narrow; 23 text boxes on a phone is
      exactly the hiccup the owner is describing.
- [ ] Per-image override at approval in admin, where she already reviews each
      photo and where the text is authenticated rather than public.
- [ ] `escapeHtml()` at the two render sites (B-7) **before** this ships.
- [ ] Note: `/api/gallery` is cached `max-age=60`, so a caption edit can take
      a minute to appear. Expected, not a bug.

### G-2 — "Latest from La Crème" section header

Owner's words: *"Let the recently uploaded images have a section header
called Most recent or Latest or something that tells them it's the latest
from lacreme."*

Cheap, because both pieces exist. `mergeManifestItems()` already unshifts
uploads to the **front**, newest-first (`gallery.js:509` onward — the "R13"
comment), and the gallery already has an interstitial system for section
breaks: `interstitials` at `gallery.js:211`, entries of the form
`{ beforeId, type:'break', cat, num, text }`. This is one more break,
inserted at the boundary between uploaded items and the first hardcoded one.

- [ ] Insert a break before the first hardcoded item's id, only when at
      least one upload is present.
- [ ] Decide the cutoff for "recent" — newest N (e.g. 12), or a date window.
      Without a cutoff the header buries deeper every week.
- [ ] Decide behaviour under a filter (e.g. "Wedding Cakes"): show the header
      there too, or only under "All".
- [ ] Never render the header with nothing under it.
