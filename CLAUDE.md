# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

La Crème — a static, no-build website for a bespoke cake / finger-food / catering business. There is no backend, no database, no bundler, and no package.json. Two hand-written HTML pages load plain `<script defer>` tags; there is no module system, so files share state via global `const`/`function` declarations in the same scope.

Every "order" (cake, finger foods, catering) is compiled client-side into a formatted text message and handed off to WhatsApp via `wa.me` links — nothing is ever submitted to a server or stored anywhere.

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
