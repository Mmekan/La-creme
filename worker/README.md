# La Crème order API

A Cloudflare Worker + D1 database. The website posts every order to it, and
`admin.html` (in the site root) reads them back behind a password login.
Free tier is plenty for this.

## One-time deploy

Run these from this `worker/` folder.

```
npx wrangler login
npx wrangler d1 create la-creme-orders
```

Copy the `database_id` it prints into `wrangler.toml`, then:

```
npx wrangler d1 execute la-creme-orders --remote --file=schema.sql
npx wrangler d1 execute la-creme-orders --remote --file=schema-media.sql
npx wrangler d1 execute la-creme-orders --remote --file=schema-invoice.sql
npx wrangler d1 execute la-creme-orders --remote --file=schema-pricing.sql
npx wrangler d1 execute la-creme-orders --remote --file=schema-bot.sql
npx wrangler secret put ADMIN_PASSWORD     # the password you'll log in with
npx wrangler secret put SESSION_SECRET     # any long random string
npx wrangler secret put TELEGRAM_BOT_TOKEN # Mekabot
npx wrangler secret put TELEGRAM_CHAT_ID   # upload alerts
npx wrangler secret put TELEGRAM_INVOICE_CHAT_IDS  # invoices, comma-separated chat ids
npx wrangler secret put TELEGRAM_OWNER_CHAT_IDS    # owner chats, also invoiced
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET    # the bot's webhook path secret
npx wrangler deploy
```

`schema-invoice.sql` and `schema-pricing.sql` are `ALTER TABLE`, not
`CREATE ... IF NOT EXISTS` — running either twice prints `duplicate column
name`. That error means the columns are already there and is safe to ignore.

`TELEGRAM_INVOICE_CHAT_IDS` is what makes invoices arrive. Leave it unset and
every order still logs, but no invoice is delivered (the Worker log says so).
`TELEGRAM_OWNER_CHAT_IDS` is added to the same delivery, deduped, so an owner
who is also listed as the company still gets one copy.

The bot webhook is `POST https://<worker>/api/tg/<TELEGRAM_WEBHOOK_SECRET>`.
Point Telegram at it once the secret is set:

```
curl "https://api.telegram.org/bot<token>/setWebhook" \
     -d "url=https://<worker>/api/tg/<secret>"
```

Bot commands, for chats in `TELEGRAM_INVOICE_CHAT_IDS` or
`TELEGRAM_OWNER_CHAT_IDS`:

| Command | What it does |
|---|---|
| `/edit-invoice` | Asks for an order number, lists its lines, then accepts `2 = 4500` (or `2 = -` for unpriced). Nothing is written until the confirmation card's button is pressed |
| `/approve` | Marks a fully-priced invoice final and resends the PDF. Refused while any line is unpriced |
| `/cancel` | Abandons the current step |

A price change offers **Save price** (order + `product_prices`, so the next
identical cake is priced too) or **This order only**. Custom and wedding cakes
have no catalogue key, so they only ever get **This order only** — a bespoke
quotation never becomes the standing price.

Every price change, revision and approval writes an `audit_log` row with the
Telegram chat id, user id and timestamp, in the same D1 batch as the change
itself. Each revision appends to `invoice_versions`; nothing is overwritten.

`node ../tools/demo-bot.mjs` drives a whole conversation against a local
`wrangler dev` with no bot token — replies are printed instead of sent, which
is the quickest way to check the flow after a change.

Wrong path and wrong secret both return a bare 404. Only chat ids in
`TELEGRAM_INVOICE_CHAT_IDS` or `TELEGRAM_OWNER_CHAT_IDS` can talk to the bot;
anything else gets one line and no order data.

`deploy` prints the Worker URL, e.g. `https://la-creme-orders.<you>.workers.dev`.
Put it in `config.js`:

```
ordersApi: 'https://la-creme-orders.<you>.workers.dev'
```

Then open `admin.html` on the live site and sign in.

## Notes

- Five wrong passwords from one address locks it out for 15 minutes.
- Sessions last 12 hours and end when the tab closes.
- To change the password later: `npx wrangler secret put ADMIN_PASSWORD`.
- Anyone can POST an order to the public endpoint, so a junk order could
  appear in the list. Numbers must match the site's format and size is capped.
