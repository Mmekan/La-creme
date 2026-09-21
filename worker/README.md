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
npx wrangler secret put ADMIN_PASSWORD     # the password you'll log in with
npx wrangler secret put SESSION_SECRET     # any long random string
npx wrangler deploy
```

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
