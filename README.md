# La Crème — Website

A single-file luxury website for La Crème (bespoke cakes, finger foods and
grand catering). No backend, no database — every order is compiled into a
formatted message and handed off to WhatsApp, where you close the sale
personally.

## 1. Set the WhatsApp number (required)

Open `index.html`, search for `TODO: WHATSAPP NUMBER`, and replace the
placeholder number with the real La Crème business WhatsApp number:

```js
whatsappNumber: '2348000000000',
```

Format: country code + number, digits only. No `+`, no leading `0`.
Example: `0803 123 4567` → `2348031234567`.

Every WhatsApp button on the site (nav, hero, floating button, contact,
and all three order forms) reads from this one line — you only need to
change it once.

## 2. Add real photos and videos

Search for `galleryItems` and `videoTestimonials` inside the `<script>`
block. Each item currently has `image: null` / `video: null`, which shows
an elegant placeholder frame. To use a real file:

```js
{ caption: 'Three-tier wedding cake — ivory & gold', image: 'images/cake-01.jpg', ... }
```

Put your photos/videos in an `images/` (or `videos/`) folder next to
`index.html`, and reference them by filename. You can also use a full
URL (e.g. an Instagram CDN link or a link from your own hosting).

## 3. Update the menu & prices

All menu content is data-driven, near the bottom of the `<script>` block:

- `fingerFoodMenu` — small chops, sausage rolls, chin chin, etc.
- `cateringSoups` / `cateringRice` / `cateringProteins` — bulk catering items
- `literOptions` / `traySizeOptions` — the litre/tray sizes and their prices

Edit the `name`, `desc`, `price` and `unit` fields directly — the page
re-renders from these arrays automatically, so you never need to touch
the HTML or CSS to update prices.

## 4. Update testimonials

Search for `testimonials` in the `<script>` block and edit the `quote`,
`name` and `event` fields with real client feedback once you have it.

## 5. Deploy

This is one static HTML file — no build step, no server required.

- **Fastest:** go to [netlify.com/drop](https://app.netlify.com/drop) and
  drag `index.html` (and your `images/` folder, if used) into the browser.
  You'll get a live link in seconds.
- **Free custom domain-ready option:** create a GitHub repo, upload these
  files, and enable GitHub Pages in the repo settings.
- **Vercel:** `vercel deploy` from this folder also works with zero config.

## How orders work

- **Cakes** — one form, all fields (occasion, tiers, flavor, filling,
  finish, inscription, design notes, delivery, contact) compile into a
  single structured WhatsApp message.
- **Finger Foods** — customers use +/− steppers to build a running order;
  a summary panel shows the live total; checkout details get appended
  and the whole order is sent as one message.
- **Catering** — soups and rice are selected by litre/tray size (one
  size per item at a time), proteins by quantity; event details
  (type, guest count, date, indoor/outdoor) are captured alongside.

Every "Send via WhatsApp" button opens `wa.me` with the message
pre-filled — nothing is charged or submitted anywhere else. No customer
data is stored; it only exists in the browser until they hit send.

## Notes for future upgrades

Since this is currently front-end only, natural next steps (not required
for launch) would be:
- Log orders somewhere (e.g. Supabase) before redirecting to WhatsApp,
  so nothing is lost if a customer doesn't send the message.
- Add Paystack/Flutterwave for deposits on cake and catering bookings.
- Replace the CSS placeholder frames with a proper photo CMS once there's
  a large enough photo library to manage.
