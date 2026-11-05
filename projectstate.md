# Project State — La Crème

**Updated:** 2026-11-05 (after Phase 5, committed and verified)
**HEAD:** `5f08ff6` · working tree clean · Phases 1–5 landed in `2cdf261`

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
| 6 | #8 — order directly from a gallery image | ⬜ not started |

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

---

## Repo state

- `2cdf261` — Phases 1–5 across nine files (546 insertions, 142 deletions).
  They share one commit because the hunks interleave inside the same files,
  so a per-phase split would need hand-built partial patches.
- `5f08ff6` — these two tracking docs.
- Working tree clean. Nothing has been pushed.

---

## Not verified / known gaps

- WhatsApp message composition was not captured end-to-end (submitting opens
  `wa.me`). Its soup lines come from the array verified in Phase 4.
- The upload **send** itself was exercised against a stubbed `XMLHttpRequest`,
  not the real worker: Clear is confirmed disabled mid-flight, the click is a
  no-op, and it re-enables after `finish()`. No bytes were sent to R2.
- Admin login with a **real** token was not exercised against the worker; the
  probe tested the session-window logic only, to avoid poking production.
- Real touch hardware and a true 390px viewport were not exercised — headless
  Chrome on Windows has a ~497px minimum layout width.
