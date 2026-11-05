# TODO — La Crème

**Updated:** 2026-11-05 (after Phase 5)
Companion to `projectstate.md`.

---

## Do first

- [ ] **Commit Phases 1–5.** Nine files are modified and uncommitted
      (`admin.js`, `config.js`, `gallery.html`, `gallery.js`, `index.css`,
      `index.html`, `index.js`, `upload.html`, `upload.js`). One commit per
      phase keeps the Phase 4 soup rewrite reviewable on its own.
- [ ] **Confirm the password question with the owner.** The upload page has
      no password to remove — the gate is the admin page, and its re-ask window
      is now 15 minutes. If she meant a different gate, say which.
- [ ] **Try an upload on a phone** and press Clear selection mid-send: it
      should refuse while sending and clear fully once finished.

## Next — Phase 6 (#8): order from a gallery image

- [ ] Add an in-context CTA inside the gallery lightbox, e.g. **"Order Small Chops."**
- [ ] Map gallery image/category → menu destination (Small Chops is the
      confirmed first case).
- [ ] Navigate to that section, scroll the target row into view and
      highlight/pulse it.
- [ ] Expand the row's quantity/selection controls so it's ready to order.
- [ ] Handle both same-page (main site) and gallery → homepage navigation.

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
