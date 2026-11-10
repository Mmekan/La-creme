# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

La Crème — a bespoke cake / finger-food / catering business. The **front end** is a static, no-build site: two hand-written HTML pages load plain `<script defer>` tags, there is no module system (files share state via global `const`/`function` in the same scope), and the site itself has no build step and no `package.json`.

There **is** now a backend: a Cloudflare Worker (`worker/`) with D1 and R2 bindings. Orders are still compiled client-side into a WhatsApp text message via `wa.me`, **and** they are `POST`ed to the Worker (`/api/orders`), which stores the order in D1 and generates/emails a PDF invoice via the Telegram bot. Uploads go to R2. So: orders *are* stored now — don't assume the site is purely client-side.

The one package.json-free exception is tooling: `tools/*.mjs` are plain Node scripts run directly (`node tools/test-bot.mjs`); `wrangler` is invoked through `npx`.

## Running / testing

There is no build, lint, or test tooling in this repo. To work on it:

- Serve the folder with any static server (e.g. via XAMPP, since it lives under `htdocs`) and open `index.html` / `gallery.html` in a browser. Opening the files directly with `file://` also works since there's no server-side logic.
- Verify changes manually in the browser — there are no automated tests.
- Deployment is just uploading the static files (Netlify Drop, GitHub Pages, or `vercel deploy` — see README.md for details).

## Architecture

### Two independent pages, shared config

- `index.html` + `index.js` — the main site: hero, about, cake order builder, finger-food order builder, catering order builder, testimonials, news ticker/popup.
- `gallery.html` + `gallery.js` — a separate masonry photo/video gallery page with its own filtering, lazy-load/infinite-scroll grid, and lightbox.
- `config.js` is loaded by **both** pages (before `index.js`/`gallery.js`) and is the single source of truth for:
  - `CONFIG.whatsappNumber` — the only place the business WhatsApp number is set.
  - `R2_BASE_URL` / `mediaUrl()` — media (photos/videos) is hosted on Cloudflare R2, not committed to the repo (`img/` is gitignored). Gallery/testimonial items reference media via `mediaUrl('img/...')` or a full external URL; `image: null` / `video: null` renders a placeholder frame instead.
  - Shared helpers used by both pages: `waLink()` / `openWhatsApp()` (build/open a `wa.me` link), `fmtNaira()`, `escapeHtml()` (sanitize any non-literal string before it hits `innerHTML`), `isValidPhone()`, and the modal focus-trap pair `openModal()`/`closeModal()` used by every overlay (lightbox, cake gallery, tier preview, news popup) on both pages.
- `index.css` is the single shared stylesheet for both pages — there is no per-page CSS split.

`index.js` and `gallery.js` independently duplicate a few things that appear on both pages (e.g. `NEWS_ITEMS`, `shuffleArray`, the news ticker/popup logic, `videoTestimonials`, `testimonials`, `openLightbox`/lightbox rendering, `showToast`). Since there's no module system, keep duplicated logic in sync manually when editing one copy — check the other file for a matching block before assuming a fix is page-local.

### Content is data-driven

Both pages render their content from arrays of plain objects near the top of the `<script>` (in practice, near the top of `index.js`/`gallery.js`), then build DOM from them — editing content means editing these arrays, not the HTML:

- `index.js`: `galleryItems`, `videoTestimonials`, `testimonials`, `cakeGalleryItems`, `fingerFoodMenu` (+ `SMALL_CHOPS_VARIANTS`, `CHIN_CHIN_VARIANTS`), `cateringSoups`, `cateringRice`, `cateringProteins`, `literOptions`/`traySizeOptions`.
- `gallery.js`: `galleryItems` (larger set, with `filterCategories`), `interstitials`, `videoTestimonials`, `testimonials`.

### Order builders (index.js)

Three independent order flows, each ending in a "Send via WhatsApp" button that calls `openWhatsApp()` with a compiled message:

- **Cakes** — one form covering occasion/tiers/flavor/filling/finish/inscription/notes/delivery/contact. Tier rows are built dynamically (`buildTierRow`, `addTierRow`/`removeTierRow`, `syncTierRows`, `updateTierAvailability`) against `CAKE_INCHES`.
- **Finger Foods** — per-item +/− steppers build a running order (`ffWidgets`, `renderFF`); Small Chops and Chin Chin have their own nested option pickers (`buildSmallChopsItem`, `buildChinChinItem`) before quantity.
- **Catering** — soups/rice are chosen by litre/tray size with a linked protein/style choice (`buildSoupRow`, `buildRiceRow`, each with an inner `commit()` that finalizes the row's selection), proteins by plain quantity; `renderCatering()` assembles the final summary and message alongside event details (type, guest count, date, indoor/outdoor).

### Gallery page (gallery.js)

Masonry-style grid with responsive column count (`columnsForWidth`, `layoutBlock`/`layoutAllBlocks`), infinite scroll (`loadMore`, `sentinelIsNear`), category filtering (`itemsForFilter`, `resetGrid`), and periodic non-photo content mixed into the grid (`interstitials`, `maybeInsertInterstitials` — quote cards, breaks).

## Editing conventions to preserve

- Never hardcode the WhatsApp number, R2 base URL, or naira formatting inline — use `CONFIG.whatsappNumber`/`waLink()`/`openWhatsApp()`, `mediaUrl()`, and `fmtNaira()` respectively so both pages stay in sync.
- Any dynamic string interpolated into `innerHTML` (as opposed to a string literal you wrote) should go through `escapeHtml()` first.
- New modals/overlays should use `openModal()`/`closeModal()` for focus handling rather than reimplementing focus trapping.

### Worker / bot conventions

- **Bot and invoice money must always be `NGN`, never `₦`.** The PDF (base-14
  WinAnsi) has no naira glyph; `cleanText()` in `worker/invoice.js` already
  rewrites `₦`→`NGN`, and `money()` in `worker/bot.js` prints `NGN`. Keep the
  only remaining `₦` — the legacy glyph in `parsePriceEntry()`'s strip regex —
  so operators' old muscle memory still works.
- **User-facing worker strings are plain ASCII** (parsing rule added next
  paragraph covers the full current set). Keep it that way.
- **The invoice letterhead/business details live in `DEFAULT_SETTINGS`** in
  `worker/invoice.js`. `renderInvoice()` does *not* read the D1 `settings`
  table — change the constant, or wire `settings` through, then regenerate the
  samples.
- Plans and specs for ongoing invoice work live in `docs/superpowers/plans/`
  and `docs/superpowers/specs/`; `projectstate.md` + `todo.md` are the live
  memory — update all three after a task, not just the code.

## Worker parity check (do this before touching worker/invoice.js or worker/bot.js)

Search **both** files for anything outside ASCII (`grep -n -P "[^\x00-\x7F]"`) and leave only: code comments, the `₦` inside `parsePriceEntry`'s strip regex, and (for now) the upload-pipeline alerts/em-dashes in `handleCreateOrder`'s vicinity. Anything else user-facing gets the ASCII treatment:

| char(s) | replacement |
|---|---|
| `₦` | `NGN ` (with trailing space) |
| `—`, `–` | `-` |
| `→` | `->` |
| `×` | `x` |
| `•` | `-` |
| `…` | `...` |
| emoji (🧾, ⏳, …) | remove; invoice captions carry none |

Then update the expectations in `tools/test-bot.mjs` and run it (`node tools/test-bot.mjs` → 28/28).

## Running the local bot demo

1. Start the worker locally: `npx wrangler dev --local --port 8792` (from `worker/`).
2. Run with the **real** secret — never the hardcoded fallback:
   `DEMO_SECRET="$(grep '^TELEGRAM_WEBHOOK_SECRET=' worker/.dev.vars | cut -d= -f2-)" DEMO_PORT=8792 DEMO_LOG="$(pwd)/.demo-dev.log" node tools/demo-bot.mjs`
   (`tools/demo-bot.mjs` reads `DEMO_SECRET`; without it every update 404s and the demo prints nothing.)
3. Beware: the demo hits live Telegram if `.dev.vars` has a real
   `TELEGRAM_BOT_TOKEN`. For a no-send run, unset the token; success is silent in the log, errors are not.
4. Orders use `INSERT OR IGNORE` — re-running the demo with the same order numbers is a no-op (use fresh numbers to re-invoice).
