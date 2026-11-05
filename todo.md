# TODO — La Crème

**Updated:** 2026-11-05 (after Phase 5)
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

## Next — Phase 6 (#8): order from a gallery image

Defined 2026-11-05, in the owner's words: in the gallery, an **Order** button
that takes the viewer to the menu for whatever they're looking at, preselects
where it can, and says what to do next.

### 6a — Order CTA in the gallery lightbox

- [ ] Add an **Order** button to the lightbox (next to the caption), labelled
      per the image's category — "Order this cake", "Order Small Chops".
- [ ] Map from the image's `category` (the item's own, not just the active
      filter — the "Cakes" catch-all has no tab of its own):

      Wedding Cakes, Traditional Wedding Cakes → cakes, occasion **Wedding**
      Anniversary                              → cakes, occasion **Anniversary**
      Cakes, Cakes for Boys/Girls/Men/Women    → cakes, occasion **Birthday**
      Small Chops                              → finger-foods
      Catering & Events                        → catering   (needs a decision)

- [ ] Navigate cross-page to `index.html` with a small query signal
      (e.g. `?order=cake&occasion=Birthday#cakes`).
- [ ] On arrival, `index.js` reads that signal once, sets the occasion select,
      scrolls the section into view, pulses the relevant row, and opens its
      quantity/selection controls.
- [ ] Toasts on arrival:
      - cake → **"How would you like the cake?"**
      - small chops → **"Complete your small chops order."**
- [ ] Clear the query signal after use so a refresh doesn't re-fire the toast
      or re-force the occasion.

### 6b — Gallery nav

- [x] Replace the dead "Gallery" link in the gallery page's nav with **Home**
      (was `opacity:.6; pointer-events:none`).

### Open questions

- Where do **Catering & Events** photos send people — `#catering`, or no CTA?
- Should the Order button also sit on the filter bar (order "this category")
  or only in the lightbox (order "this photo")?

## Then — final regression sweep

- [ ] Desktop + mobile pass over: cart restore, WhatsApp messages, gallery
      filters, every modal's close paths, uploads, and admin approval.
- [ ] Check the cake / finger-food / catering carts still agree after the soup
      model change (totals, badge count, checkout review).
- [ ] Check the admin flow end-to-end: password → 15-minute window → 401
      re-prompt after the server token expires.

---

## Done (recent)

- [x] Phase 4 — soups use the rice cart mechanism (separate lines per protein).
- [x] Phase 5 — upload **Clear selection** button.
- [x] Admin password asked once per 15 minutes instead of every new tab.

## Parked

- Removing the upload password — there isn't one. Re-confirm what was meant
  before changing any gate; the unlisted URL is currently the only guard.
