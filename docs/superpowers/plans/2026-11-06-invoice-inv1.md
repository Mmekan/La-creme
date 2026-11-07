# INV-1 — PDF Invoice on Every Order · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every placed order produces a PDF invoice that lands in company Telegram automatically, alongside today's WhatsApp text order — with no new service, no dependencies, and an admin button that downloads the same PDF.

**Architecture:** The existing `la-creme-orders` Worker gains three things: (1) a `lines_json` column so an order carries machine-readable line items next to today's `items` text blob, (2) a hand-rolled PDF renderer (`worker/invoice.js`) that turns an order row into bytes, and (3) a `sendDocument` Telegram helper that pushes those bytes to every chat in `TELEGRAM_INVOICE_CHAT_IDS` at order-create time, fire-and-forget. A new admin-only `GET /api/orders/:no/invoice` serves the same bytes to `admin.html`. Nothing about the WhatsApp flow, `printReceipt`, or the admin order list changes.

**Tech Stack:** Cloudflare Workers (ESM, no framework) · D1 · Telegram Bot API (`sendDocument`, multipart) · vanilla HTML/CSS/JS, `<script defer>`, no build step, no `package.json`, no npm dependencies (wrangler is used only as a local CLI, never imported).

**Spec:** `docs/superpowers/specs/2026-11-06-invoice-workflow-design.md` (§4.1, §5, §6, §7.1a, §8, §10)

---

## Global Constraints

- **No build step, no bundler, no `package.json`, no npm dependencies.** `wrangler.toml` keeps `main = "index.js"`. `worker/invoice.js` is a plain relative ES-module import — wrangler resolves it at deploy/dev time; nothing is installed.
- **The PDF renderer must be pure JS with zero dependencies.** Workers cannot take native PDF libraries. No `CompressionStream`, no font embedding — base-14 fonts only.
- **No automated test suite exists and none is being introduced.** Verification is `curl` against `wrangler dev` (local), small throwaway `node` scripts, and explicit browser steps. Treat a failed step exactly like a failing test — do not proceed to commit.
- **Never touch production.** `npx wrangler dev` (local miniflare) only. Never `wrangler deploy`, never `--remote` D1. The one exception is reading a secret list, which is not needed for INV-1.
- **`MAX_BODY_BYTES` is 30 KB and must not be raised.** Budget after adding `lines`: `items` ≤ 12,000 + `lines_json` ≤ 12,000 + every other field ≤ ~2,600 = ~26,600 bytes, inside the 30,720 cap. Task 3 asserts this with a deliberately oversized order.
- **`items` stays a text blob and is still written.** `admin.js`'s list and `printReceipt` render from it and are not touched.
- **`admin.js` builds DOM with `el()` + `textContent`, never `innerHTML`.**
- **`admin.js`'s `api()` helper always calls `res.json()`** — it cannot fetch a PDF. The invoice button needs its own binary fetch; do not bend `api()`.
- **A malformed line must never lose the order.** `handleCreateOrder` already responds `{ok:true}` unconditionally; invalid `lines` entries are dropped, never 400'd.
- **Naira in the PDF is `NGN 38,000`, never `₦`.** Base-14 PDF fonts have no naira glyph. The site and WhatsApp keep `₦`.
- **Telegram sends are fire-and-forget via `ctx.waitUntil()` and never throw.** A Telegram outage must not fail an order (same contract as `sendTelegram` today).
- **Upload alerts keep going to `TELEGRAM_CHAT_ID`.** Invoices go to `TELEGRAM_INVOICE_CHAT_IDS` only — no fallback, no overlap.
- **Git Bash / MSYS:** curl output files (`-o /tmp/x.pdf`) are fine; only `-F "file=@..."` input needs `$(cygpath -m ...)`.
- **Local D1 note:** `wrangler dev` uses its own local database. Every schema file must be applied with `--local` before testing, or the columns won't exist.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `worker/schema-invoice.sql` | Create | `ALTER TABLE orders ADD COLUMN lines_json / revised` (idempotent-by-hand). |
| `worker/invoice.js` | Create | `parseInvoiceChatIds`, `validateLines`, `renderInvoice` — pure functions, no `env`. |
| `worker/index.js` | Modify | Store/read `lines_json`, `sendDocument`, invoice route, fire-on-create. |
| `config.js` | Modify | `invoiceLines()` — the one client-side mapper both checkouts share. |
| `index.js` | Modify | Pass `lines` at both `logOrder()` call sites (cake-only, combined). |
| `admin.js` | Modify | **Invoice** button + binary fetch + blob download. |

`admin.html`, `index.html`, `upload.*`, `gallery.*` need **no change**.

---

### Task 1: `lines_json` + `revised` columns

**Files:** Create `worker/schema-invoice.sql`

- [ ] **Step 1: Write the schema file.**

```sql
-- INV-1: structured line items + revision marker.
-- Spec: docs/superpowers/specs/2026-11-06-invoice-workflow-design.md §4.1
--
-- SQLite has no "ADD COLUMN IF NOT EXISTS", so re-running this file errors
-- with "duplicate column name". That error is the expected, safe outcome —
-- it means the column is already there. schema.sql / schema-media.sql are
-- CREATE ... IF NOT EXISTS and stay re-runnable; this one cannot be.
ALTER TABLE orders ADD COLUMN lines_json TEXT;
ALTER TABLE orders ADD COLUMN revised INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Apply it to the local database and confirm the shape.**

```bash
cd worker
npx wrangler d1 execute la-creme-orders --local --file=schema.sql
npx wrangler d1 execute la-creme-orders --local --file=schema-media.sql
npx wrangler d1 execute la-creme-orders --local --file=schema-invoice.sql
npx wrangler d1 execute la-creme-orders --local --command "PRAGMA table_info(orders)"
```

Expected: the table dump lists `lines_json` and `revised` after `status`. Re-running step 2's last command must print `duplicate column name: lines_json` — if it silently succeeds, the file was not applied.

- [ ] **Step 3: Document the deploy step.**

Add the invoice schema line to `worker/README.md`'s one-time deploy block, directly after `schema-media.sql`, so a fresh deploy does not miss it.

---

### Task 2: client `lines` at both call sites

**Files:** `config.js` (add helper near `logOrder`), `index.js` (two call sites)

The two checkouts assemble different carts but need the same shape: `{d, q, p}` where `d` is the printed description, `q` a positive integer, `p` a unit price in naira or `null` when the price is "via WhatsApp".

- [ ] **Step 1: Add `invoiceLines()` to `config.js`**, immediately after `logOrder()` and before the MEDIA section:

```js
/* Shapes already-built cart lines into the invoice's line array:
   { d: description, q: quantity, p: unit price in naira, or null }
   p === null means "price on request" — the invoice prints
   "Price via WhatsApp" and leaves it out of the total, matching the
   cart's own priceLabel behaviour. Capped to match the Worker's
   MAX_INVOICE_LINES so a pathological cart can't break the order log. */
function invoiceLines(lines){
  return lines
    .filter(l=> l && l.d)
    .slice(0, 100)
    .map(l=>({
      d: String(l.d).slice(0, 160),
      q: Math.max(1, Math.floor(Number(l.q) || 1)),
      p: l.p == null ? null : Math.max(0, Number(l.p) || 0)
    }));
}
```

- [ ] **Step 2: Cake-only checkout (`index.js:853`).** Both `logOrder` bodies gain a `lines` key. Cakes have no fixed price:

```js
    items: cakeCart.map(cakeLogText).join('\n'),
    // One invoice line per cake; price is settled on WhatsApp.
    lines: invoiceLines(cakeCart.map(cake=>({
      d: `${cake.occasion} cake, ${cake.tiersLabel}, ${cake.flavor}`,
      q: 1,
      p: null
    }))),
    total: '',
```

- [ ] **Step 3: Combined checkout (`index.js:1829`).** `ffLines` and `catLines` already carry `{name, qty, unitPrice}`; cakes ride along unpriced. Insert before `total:`:

```js
    items: [...ffItemLines, ...cateringItemLines, ...cakes.map(cakeLogText)].join('\n'),
    lines: invoiceLines([
      ...ffLines.map(l=>({ d: l.name, q: l.qty, p: l.unitPrice })),
      ...catLines.map(l=>({ d: l.name, q: l.qty, p: l.unitPrice })),
      ...cakes.map(c=>({ d: `${c.occasion} cake, ${c.tiersLabel}, ${c.flavor}`, q: 1, p: null }))
    ]),
    total: fmtNaira(total) + (cakes.length ? ' + cake price via WhatsApp' : ''),
```

- [ ] **Step 4: Verify `ffLines` and `catLines` element shapes before writing Step 3.** They are built by `CART_SOURCES`; confirm each element has `name`, `qty`, `unitPrice` (a `priceLabel` on some lines is display-only and must **not** be mapped to `p`). Run:

```bash
cd "c:/xampp/htdocs/La creme"
grep -n "name:.*qty:.*unitPrice\|qty:.*unitPrice" index.js | head
```

If a source yields a different key name, map it, don't rename the source.

- [ ] **Step 5: Syntax check both files.**

```bash
node --check config.js && node --check index.js
```

- [ ] **Step 6: Browser check (no network needed).** Open `index.html`, add 1 finger-food item, 1 soup, 1 cake; on checkout confirm the WhatsApp message and on-screen total are unchanged from before the edit. In DevTools, breakpoint `logOrder` and confirm the payload now carries a `lines` array whose `d/q/p` match what is displayed. **The order must not visibly change in any other way.**

---

### Task 3: `worker/invoice.js` — shared helpers + validation

**Files:** Create `worker/invoice.js`

- [ ] **Step 1: Write the module header and `parseInvoiceChatIds`.**

```js
/* ============================================================
   LA CRÈME — INVOICE MODULE (pure: no env, no I/O)

   Spec: docs/superpowers/specs/2026-11-06-invoice-workflow-design.md

   Three exports:
     parseInvoiceChatIds(secret) -> string[]   who receives invoices
     validateLines(raw)          -> array       sanitised line items
     renderInvoice(order)        -> Uint8Array  the PDF

   Everything here is deterministic and testable in isolation; the
   Worker wiring lives in index.js.
============================================================ */

// Spec §4.1: cap the array and the serialised size, same ceiling as
// the items text blob.
export const MAX_INVOICE_LINES = 100;
export const MAX_LINES_BYTES = 12000;

// Spec §7.1a: ONE bot, TWO destinations. Upload alerts keep using
// TELEGRAM_CHAT_ID; invoices use this comma-separated list, so adding
// a sales rep is `wrangler secret put` and nothing else. The cap is a
// guard against a fat-fingered secret fanning out to hundreds of chats.
export function parseInvoiceChatIds(secret) {
  const ids = String(secret || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return [...new Set(ids)].slice(0, 20);
}
```

- [ ] **Step 2: Write `validateLines`.** Must never reject an order; it drops what it cannot trust.

```js
// A malformed line must never lose the order (spec §6). Each entry is
// accepted only if it is an object with a usable description, a
// positive integer quantity and a non-negative price or null; anything
// else is dropped. Re-run on read too, so a hand-edited row cannot
// inject into the PDF (spec §9).
export function validateLines(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object') continue;
    const d = typeof l.d === 'string' ? l.d.trim().slice(0, 160) : '';
    if (!d) continue;
    const q = Number(l.q);
    if (!Number.isInteger(q) || q < 1 || q > 9999) continue;
    const p = l.p === null || l.p === undefined ? null : Number(l.p);
    if (p !== null && (!Number.isFinite(p) || p < 0)) continue;
    out.push({ d, q, p: p === null ? null : Math.round(p) });
    if (out.length >= MAX_INVOICE_LINES) break;
  }
  return out;
}
```

- [ ] **Step 3: Write `parseStoredLines`** — the read-side entry point used by both the renderer and the Invoice endpoint. Accepts the DB string, falls back to the `items` blob per spec §4.1:

```js
// Reads what is actually in the row. New orders carry JSON; old ones
// (lines_json IS NULL) fall back to the items text blob rendered as
// unpriced lines, so a historical order still produces a document.
export function parseStoredLines(order) {
  if (order && order.lines_json) {
    try { return validateLines(JSON.parse(order.lines_json)); } catch (e) { /* fall through */ }
  }
  const blob = String((order && order.items) || '');
  const out = [];
  for (const text of blob.split('\n')) {
    const d = text.trim().slice(0, 160);
    if (!d) continue;
    out.push({ d, q: 1, p: null });
    if (out.length >= MAX_INVOICE_LINES) break;
  }
  return out;
}
```

- [ ] **Step 4: Verify the helpers in isolation.** Node treats `.js` as CJS here (no `package.json`), so import through a throwaway `.mjs` copy:

```bash
cd "c:/xampp/htdocs/La creme"
cp worker/invoice.js /tmp/inv.mjs
node -e "import('file:///tmp/inv.mjs').then(m=>{
  const ok = [
    m.validateLines(null).length===0,
    m.validateLines('nope').length===0,
    m.validateLines([{d:'Meat Pie',q:2,p:1000}])[0].q===2,
    m.validateLines([{d:'',q:1,p:1}]).length===0,
    m.validateLines([{d:'x',q:1.5,p:1}]).length===0,
    m.validateLines([{d:'x',q:1,p:-1}]).length===0,
    m.validateLines([{d:'x',q:1,p:null}])[0].p===null,
    m.validateLines(Array.from({length:150},(_,i)=>({d:'L'+i,q:1,p:1}))).length===100,
    m.parseStoredLines({lines_json:'not json',items:'a\nb'}).length===2,
    m.parseStoredLines({lines_json:JSON.stringify([{d:'A',q:1,p:5}])})[0].d==='A',
    m.parseInvoiceChatIds(' 1, 2 ,,1, ').length===2
  ];
  if(ok.every(Boolean)) console.log('PASS'); else console.log('FAIL', ok);
})"
```

Expected: `PASS`.

- [ ] **Step 5: Syntax check.**

```bash
node --check worker/invoice.js
```

---

### Task 4: `renderInvoice()` — the PDF

**Files:** `worker/invoice.js`

Design rules, so a layout change later is a change to one function:

- **Objects are numbered lazily.** Keep `const objs = []` and `reserve()` / `setObj(id, body)`; the byte offsets for the xref are computed in a second pass over `objs`. Never hand-number.
- **Two primitive functions only.** `text(x, y, str, {font, size})` and `rule(x1, y1, x2, y2)` append PDF operators to the current page's content string. Everything visible in the invoice is built from those two.
- **Content streams stay uncompressed.** No `FlateDecode` — a few KB either way, and it keeps the output greppable for verification.
- **Latin-1 only, `WinAnsiEncoding` on both fonts.** `È` is 0xC8 and renders correctly; any code point above 255 becomes `?`. `₦` never reaches the renderer — `money()` emits `NGN `.
- **Paginate.** 100 lines do not fit one A4 page. Lines-per-page is derived from the row height and the page body height, not hardcoded by eye.

- [ ] **Step 1: Write the primitives and structure.**

```js
const PAGE_W = 595, PAGE_H = 842;          // A4, points
const MARGIN = 48;
const FONT_R = 'F1', FONT_B = 'F2';        // Helvetica / Helvetica-Bold

// "NGN 38,000". Base-14 fonts have no naira glyph, so the PDF says NGN
// and the rest of the business keeps saying ₦ (spec §2).
function money(n) {
  const v = Math.round(Number(n) || 0);
  return 'NGN ' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// A PDF literal string: escape \ ( ) and clamp to Latin-1. Anything
// above 255 has no glyph in a base-14 font and becomes '?'.
function pdfString(s) {
  return '(' + String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?') + ')';
}
```

- [ ] **Step 2: Write `renderInvoice(order)`** producing:

| Region | Content |
|---|---|
| Header | `LA CRÈME` (bold, large), tagline, `INVOICE`, order no, date issued |
| `REVISED v{n}` stamp | only when `revised > 0`, `n = revised + 1` (first correction = v2) |
| Customer block | name, phone, delivery method + address, date needed |
| Line table | `#`, description, qty, unit price, line total; `Price via WhatsApp` in both money columns when `p === null` |
| Total | `TOTAL` + sum of `q*p` for priced lines; append `(excluding items priced on WhatsApp)` when any line is unpriced |
| Footer | `Thank you for choosing La Crème` |

Date format `04 Nov 2026` from `order.received_at` — a fixed month-name array, not `toLocaleString` (Workers' ICU is available but the local/edge output must match exactly what is printed here).

- [ ] **Step 3: Write the object assembler.** Emit, in this order: catalog (1), pages (2), one page object per page, the two font objects, then one content stream per page. Set `/Count` and `/Kids` from the actual page count. Close with:

```
xref
<n> <count>
0000000000 65535 f
<ten-digit offset> 00000 n     ...one per object
trailer << /Size <count+1> /Root 1 0 R >>
startxref
<byte offset of the xref table>
%%EOF
```

Offsets are byte offsets in the final output; build the body as an array of `Uint8Array` chunks and accumulate `offset += chunk.length` with `TextEncoder`, because a Latin-1 char like `È` is one byte in the declared encoding and the assembler must agree with the xref.

- [ ] **Step 4: Structural verification** — a throwaway script that actually parses the file, not just greps it:

```bash
cat > /tmp/check-pdf.mjs <<'EOF'
import { readFileSync } from 'node:fs';
const buf = readFileSync(process.argv[2]);
const s = buf.toString('latin1');
const fail = (m) => { console.log('FAIL', m); process.exit(1); };
if (!s.startsWith('%PDF-1.')) fail('header');
if (!s.trimEnd().endsWith('%%EOF')) fail('trailer');
const sx = /startxref\s+(\d+)\s+%%EOF/.exec(s) || fail('startxref');
const start = Number(sx[1]);
if (!s.slice(start).startsWith('xref')) fail('xref does not start at startxref');
const head = /^xref\s+0 (\d+)\s*\n/.exec(s.slice(start));
if (!head) fail('xref header');
const count = Number(head[1]);
const rows = s.slice(start).split('\n').slice(2, 2 + count);
let bad = 0;
for (let i = 0; i < count; i++) {
  const m = /^(\d{10}) (\d{5}) ([nf])$/.exec(rows[i].trim());
  if (!m) { fail('xref row ' + i); }
  if (m[3] === 'n') {
    const body = s.slice(Number(m[1]), Number(m[1]) + 24);
    if (!body.startsWith(i + ' 0 obj')) { console.log('  offset', i, JSON.stringify(body)); bad++; }
  }
}
if (bad) fail(bad + ' offsets do not land on their objects');
const size = /\/Size (\d+)/.exec(s);
if (Number(size[1]) !== count) fail('Size vs xref count');
console.log('PASS', count, 'objects,', buf.length, 'bytes');
EOF
```

- [ ] **Step 5: Run it against three synthetic orders** — a plain priced order, a cake-only order (all `p: null`), and a 100-line order that must paginate:

```bash
cp worker/invoice.js /tmp/inv.mjs
node -e "import('file:///tmp/inv.mjs').then(async m=>{
  const { writeFileSync } = await import('node:fs');
  const base = { order_number:'20261106-101500123-AB', received_at:'2026-11-06T10:15:00.123Z',
    name:'Ada Obi', phone:'08031234567', delivery:'Delivery', address:'12 Awolowo Rd, Ikoyi',
    date_needed:'2026-11-20', revised:0 };
  const cases = {
    plain: {...base, lines_json: JSON.stringify([{d:'Meat Pie',q:2,p:1000},{d:'Afang Soup, 5L, Goat',q:1,p:30000}])},
    cake:  {...base, items:'Birthday cake, One Step, Vanilla | needed 2026-11-20'},
    many:  {...base, lines_json: JSON.stringify(Array.from({length:100},(_,i)=>({d:'Item number '+(i+1),q:i+1,p:500+i})))},
    revised:{...base, revised:2, lines_json: JSON.stringify([{d:'Meat Pie',q:2,p:1200}])}
  };
  for (const [k,o] of Object.entries(cases)) writeFileSync('/tmp/'+k+'.pdf', m.renderInvoice(o));
  console.log('wrote', Object.keys(cases).join(' '));
})"
for f in plain cake many revised; do echo -n "$f: "; node /tmp/check-pdf.mjs /tmp/$f.pdf; done
```

Expected: four `PASS` lines.

- [ ] **Step 6: Visual check.** Open each of `/tmp/plain.pdf`, `/tmp/cake.pdf`, `/tmp/many.pdf` in a real PDF viewer. Confirm: `LA CRÈME` header, order number, the line table aligned, `Price via WhatsApp` for cakes, `NGN 30,000` never `₦`, page 2+ of `many.pdf` continues cleanly, and `revised.pdf` shows `REVISED v3`. **This is the step that cannot be automated — a structurally valid PDF can still be ugly.** Layout changes requested by the owner land here.

---

### Task 5: store `lines_json`, serve the invoice

**Files:** `worker/index.js`

- [ ] **Step 1: Import the module** at the top of `index.js`, after the existing constants:

```js
import { parseInvoiceChatIds, validateLines, parseStoredLines, renderInvoice } from './invoice.js';
```

- [ ] **Step 2: `handleCreateOrder` writes `lines_json`.** Add the column to the INSERT and the binding, deriving it from the same validation the read path uses:

```js
  const linesJson = JSON.stringify(validateLines(o.lines));
  // Cap to the same 12,000 bytes as the items blob; over that, drop
  // from the tail rather than reject — the order must still be logged.
  const linesStored = linesJson.length > 12000 ? JSON.stringify(validateLines(o.lines).slice(0, 20)) : linesJson;
```

Bind `linesStored` as the 15th parameter (after `clip(o.notes, 1500)`), and keep the INSERT's `INSERT OR IGNORE` semantics exactly as they are.

- [ ] **Step 3: `handleGetInvoice`** — admin-only. Falls back to `parseStoredLines` so historical rows still render:

```js
async function handleGetInvoice(env, orderNumber) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE order_number = ?')
    .bind(orderNumber).first();
  if (!order) return json({ error: 'Not found' }, 404);
  const bytes = renderInvoice({ ...order, lines_json: JSON.stringify(parseStoredLines(order)) });
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="LaCreme-Invoice-${order.order_number}.pdf"`,
      'Cache-Control': 'no-store',
      ...cors,
    },
  });
}
```

`Content-Disposition` needs `Access-Control-Expose-Headers` only if the browser reads it — it does not (the filename is rebuilt client-side), so no new cors header.

- [ ] **Step 4: Route it** inside the authed `/api/` block, **before** the single-order matcher, next to the existing `/retry`-before-`/:id` comment:

```js
        const mi = url.pathname.match(/^\/api\/orders\/([\w-]+)\/invoice$/);
        if (mi && request.method === 'GET') return await handleGetInvoice(env, mi[1]);
```

- [ ] **Step 5: Verify with `wrangler dev`.** In one terminal:

```bash
cd worker && npx wrangler dev --port 8787
```

In another — place a real-shaped order (same content type the site uses) and read it back:

```bash
NO=20261106-101500123-AB
curl -s -X POST http://127.0.0.1:8787/api/orders \
  -H 'Content-Type: text/plain;charset=UTF-8' \
  -d "{\"orderNumber\":\"$NO\",\"orderType\":\"Finger Foods\",\"name\":\"Ada Obi\",\"phone\":\"08031234567\",\"items\":\"2 × Meat Pie — ₦2,000\",\"total\":\"₦2,000\",\"lines\":[{\"d\":\"Meat Pie\",\"q\":2,\"p\":1000}]}"
# -> {"ok":true}

cd worker && npx wrangler d1 execute la-creme-orders --local \
  --command "SELECT order_number, lines_json, revised FROM orders WHERE order_number='$NO'"
# -> lines_json = [{"d":"Meat Pie","q":2,"p":1000}], revised = 0
```

Then fetch the PDF (password comes from `worker/.dev.vars` — do not echo it):

```bash
cd worker
PW=$(grep '^ADMIN_PASSWORD=' .dev.vars | cut -d= -f2-)
TOKEN=$(curl -s -X POST http://127.0.0.1:8787/api/login -H 'Content-Type: application/json' -d "{\"password\":\"$PW\"}" | sed 's/.*"token":"\([^"]*\)".*/\1/')
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8787/api/orders/$NO/invoice" -o /tmp/live.pdf
node /tmp/check-pdf.mjs /tmp/live.pdf
```

Expected: `PASS`, and the PDF opens showing order `20261106-101500123-AB` with `Meat Pie ×2` at `NGN 1,000` / `NGN 2,000`.

- [ ] **Step 6: Verify the two negative paths.**

- No token → `401 {"error":"Unauthorized"}`.
- Unknown order number → `404 {"error":"Not found"}`.
- A hand-edited row (`UPDATE orders SET lines_json='[{"d":"x","q":"abc","p":-5}]'`) → still 200, with that line dropped. This is the spec §9 guarantee; confirm it rather than assume it.

- [ ] **Step 7: Oversized-order budget check.** POST an order whose `lines` and `items` are both deliberately fat, and confirm the response is `{"ok":true}` — not `413 Too large`:

```bash
node -e "const lines=Array.from({length:200},(_,i)=>({d:'A fairly long item description number '+(i+1),q:100,p:99999}));
  console.log(JSON.stringify({orderNumber:'20261106-110000999-ZZ',orderType:'Catering',name:'Budget Test',
    items:'x'.repeat(12000),total:'₦1',lines}))" > /tmp/big.json
curl -s -X POST http://127.0.0.1:8787/api/orders -H 'Content-Type: text/plain;charset=UTF-8' --data-binary @/tmp/big.json
```

If this returns `413`, the client-side `slice(0,100)` in `invoiceLines` is not doing its job — fix there, do not raise `MAX_BODY_BYTES`.

---

### Task 6: `sendDocument` — invoices to company Telegram

**Files:** `worker/index.js`

- [ ] **Step 1: Add the document sender** next to `sendTelegram`, matching its never-throw contract:

```js
// Fire-and-forget, like sendTelegram: an invoice that fails to send must
// never fail the order. The caption carries the order summary, so the
// rep sees what it is without opening the file — one Telegram call per
// recipient instead of two.
async function sendDocument(env, chatId, bytes, filename, caption) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    if (caption) form.append('caption', caption);
    form.append('document', new Blob([bytes], { type: 'application/pdf' }), filename);
    // No Content-Type header: the runtime sets the multipart boundary.
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: 'POST', body: form,
    });
    if (!res.ok) console.error('telegram document:', res.status, await res.text());
  } catch (err) {
    console.error('telegram document:', err && err.name ? err.name : 'error');
  }
}
```

- [ ] **Step 2: Add the fan-out helper** — one call per chat id, all inside the caller's `waitUntil`:

```js
// Spec §7.1a: invoices go to TELEGRAM_INVOICE_CHAT_IDS only — never to
// the upload-alert chat. No fallback: if the secret is unset the invoice
// is simply not delivered, and the log says why.
function sendInvoiceToCompany(env, order, caption) {
  const ids = parseInvoiceChatIds(env.TELEGRAM_INVOICE_CHAT_IDS);
  if (!ids.length) { console.error('invoice: TELEGRAM_INVOICE_CHAT_IDS is not set'); return Promise.resolve(); }
  const bytes = renderInvoice(order);
  const filename = `LaCreme-Invoice-${order.order_number}.pdf`;
  return Promise.all(ids.map(id => sendDocument(env, id, bytes, filename, caption)));
}
```

- [ ] **Step 3: Fire it at create time.** `handleCreateOrder` currently takes `(request, env)`; change it to `(request, env, ctx)` and update the route call. After a successful insert, **and only when the insert actually created the row** (`INSERT OR IGNORE` means a duplicate order number must not send a second invoice), hand the work to `ctx.waitUntil`:

```js
  const info = await env.DB.prepare(...INSERT...).run();
  // changes === 0 means the order number already existed: the browser
  // sendBeacon/fetch fallback re-sent it. Do not invoice twice.
  if (info.meta && info.meta.changes) {
    ctx.waitUntil(sendInvoiceToCompany(
      env,
      { ...o, lines_json: linesStored, revised: 0 },
      `🧾 Invoice ${o.orderNumber}\n${clip(o.name, 120)} · ${clip(o.total, 30) || 'price on request'}`
    ));
  }
```

The caption must be built from `clip()`ed values — it is a Telegram payload bound.

- [ ] **Step 4: Verify the fire, without real Telegram traffic.** Add a stub to `worker/.dev.vars` (gitignored) so the call fires and fails harmlessly:

```
TELEGRAM_BOT_TOKEN=stub-token-not-real
TELEGRAM_INVOICE_CHAT_IDS=111111,222222
```

Restart `wrangler dev`, place a fresh order, and confirm:
- the POST still returns `{"ok":true}`;
- the dev log shows **two** `telegram document: 404` lines (one per chat id) — proving the fan-out and that a failure does not escape;
- placing the **same** order number a second time logs **no** further document lines (`changes === 0` guard).

- [ ] **Step 5: Verify the unset-secret path.** Comment out `TELEGRAM_INVOICE_CHAT_IDS`, restart, place an order: the log prints `invoice: TELEGRAM_INVOICE_CHAT_IDS is not set`, the order still returns `{"ok":true}`, and **no** `sendDocument` attempt is logged. Restore the stub afterwards.

- [ ] **Step 6: Confirm upload alerts are unaffected.** Upload one photo through `upload.html` against `wrangler dev`; the log must still show the `sendMessage` attempt against `TELEGRAM_CHAT_ID`, not the invoice list.

---

### Task 7: admin **Invoice** button

**Files:** `admin.js`

- [ ] **Step 1: Add a binary fetch** beside `api()`. It cannot reuse `api()` (which always parses JSON) and must mirror its 401 handling:

```js
// Downloads bytes, not JSON — api() always parses JSON, so the invoice
// needs its own fetch. Same 401 contract: an expired session signs out
// rather than downloading an error page.
async function apiBlob(path){
  const token = readSession();
  const res = await fetch(API + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if(res.status === 401){ signOut(); throw new Error('Session expired, please sign in again.'); }
  if(!res.ok){
    const data = await res.json().catch(()=> ({}));
    throw new Error(data.error || `Download failed (${res.status})`);
  }
  return await res.blob();
}
```

- [ ] **Step 2: Add the button** in `renderDetail`, between **Print receipt** and the WhatsApp link:

```js
  const invoice = el('button', { class:'btn ghost', type:'button', text:'Invoice' });
  invoice.addEventListener('click', async ()=>{
    invoice.disabled = true;
    try{
      const blob = await apiBlob(`/api/orders/${encodeURIComponent(o.order_number)}/invoice`);
      const url = URL.createObjectURL(blob);
      const a = el('a', { href:url, download:`LaCreme-Invoice-${o.order_number}.pdf` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(()=> URL.revokeObjectURL(url), 10000);
    }catch(err){ alert(err.message); }
    finally{ invoice.disabled = false; }
  });
```

Append it in the actions row: `el('div', { class:'actions' }, status, print, invoice, ...(wa ? [wa] : []))`.

- [ ] **Step 3: Verify in the browser** against `wrangler dev`, with `admin.js` pointed at it (`config.js`'s `ordersApi` — point it at `http://127.0.0.1:8787` in DevTools by overriding the constant, or temporarily, and revert):

- Sign in → select an order → **Invoice** downloads `LaCreme-Invoice-<no>.pdf`; open it, confirm it matches §Task 4's visual check.
- **Print receipt** still prints the old text receipt, unchanged.
- Expire/invalidate the token in `localStorage` → **Invoice** signs out with the session message, no download of an error page.
- Select an order with no lines (an old row) → the invoice still downloads, with unpriced lines from `items`.

- [ ] **Step 4: `node --check admin.js`.**

---

### Task 8: full sweep + docs

- [ ] **Step 1: Re-run Task 5 Step 5 end to end** on a clean local DB (`--local` schema files re-applied), plus Task 4 Step 5's four synthetic PDFs, plus Task 6's four Telegram checks. All green.
- [ ] **Step 2: Confirm the site is untouched.** With the local worker running, place a real order from `index.html` → WhatsApp message identical to before the change; cake-only order likewise; admin list/detail render exactly as before plus the new button.
- [ ] **Step 3: Update `todo.md`** — tick INV-1's items, record what shipped, and leave INV-2 as the next phase.
- [ ] **Step 4: Update `projectstate.md`** — INV-1 row → ✅ done, plus a "What INV-1 changed" section in the style of the Phase 4/5 entries: files, the `lines` shape, the renderer's primitives, the two Telegram destinations, and the `INSERT OR IGNORE` / re-send guard.
- [ ] **Step 5: Record the open item honestly.** The invoice layout is a first draft the owner has not seen; `TELEGRAM_INVOICE_CHAT_IDS` must be set with `wrangler secret put` before anything is delivered — a deploy without it invoices nobody, silently (the log says so, nothing else does). Put both in `projectstate.md`'s open items and `todo.md`'s "Do first".
- [ ] **Step 6: Commit** — code + schema + docs in one commit, message naming INV-1. Do not push (no remote).

---

## Out of Scope (do not build here)

- `/edit-invoice`, `bot_state`, the webhook, `/api/orders/:no/revise` — all INV-2.
- Live price editing — INV-3.
- Payment state, customer-facing invoice links, WhatsApp Cloud API.
