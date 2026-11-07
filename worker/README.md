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
npx wrangler secret put ADMIN_PASSWORD     # the password you'll log in with
npx wrangler secret put SESSION_SECRET     # any long random string
npx wrangler secret put TELEGRAM_BOT_TOKEN # Mekabot
npx wrangler secret put TELEGRAM_CHAT_ID   # upload alerts
npx wrangler secret put TELEGRAM_INVOICE_CHAT_IDS  # invoices, comma-separated chat ids
npx wrangler deploy
```

`schema-invoice.sql` is `ALTER TABLE`, not `CREATE ... IF NOT EXISTS` — running it
twice prints `duplicate column name`. That error means the columns are already
there and is safe to ignore.

`TELEGRAM_INVOICE_CHAT_IDS` is what makes invoices arrive. Leave it unset and
every order still logs, but no invoice is delivered (the Worker log says so).

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
