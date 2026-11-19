/* ============================================================
   TELEGRAM BOT — pure helpers (R2.4)

   Everything here is a pure function of its arguments: parsing what an
   operator typed, formatting what they should read, and building the
   short strings an inline button can carry. No D1, no fetch, no env.
   That is deliberate — the conversation rules are the part most worth
   testing, and they should be testable without a database.

   Spec: docs/superpowers/specs/2026-11-09-invoice-revision-design.md §8
============================================================ */

import { parseInvoiceChatIds } from './invoice.js';

// A price above this is a typo, not a cake. Rejecting it is friendlier
// than writing NGN 45,000,000 into an invoice and the catalogue.
export const MAX_PRICE = 100000000;

// Telegram truncates callback_data at 64 bytes, so buttons carry a scope
// and a short quote id only: the order and the amounts live in bot_state,
// where they cannot be tampered with by pressing an old button.
const QUOTE_ID_CHARS = 8;

export function normKey(s) {
  return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();
}

// Spec §5.1 cake match key: the price-affecting configuration and nothing
// else. Occasion is excluded (a two-tier vanilla birthday and anniversary
// cake cost the same), as are date, inscription and design — the last two
// are per-order text, so including them would make every cake unique and
// no cake would ever match the catalogue. Mirrors cakeSpecKey() in
// config.js; tools/test-spec-key.mjs holds the two to the same answers.
//
// Returns null for custom and Wedding cakes: they are always quoted by
// hand, so they must never pick up a catalogue price.
export function cakeSpecKey({ tiersLabel, tierDetails, flavor, finish, occasion } = {}) {
  if (/^wedding$/i.test(String(occasion || '').trim())) return null;
  if (/^custom/i.test(String(tiersLabel || '').trim())) return null;
  const parts = [tiersLabel, (tierDetails || []).slice().sort().join(' ; '), flavor, finish || ''];
  return parts.map(normKey).filter(Boolean).join('|');
}

// "NGN 38,000" — plain ASCII, matching the PDF (base-14 fonts have no
// naira glyph). Keeping the bot and the invoice on the same spelling also
// means nothing user-facing depends on how a character gets encoded.
export function money(n) {
  const v = Math.round(Number(n) || 0);
  return 'NGN ' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// WAT is UTC+1 all year and has never observed DST, so the Lagos day is
// fixed arithmetic, not a timezone lookup. The window is the Lagos calendar
// day that ended at `now`; the report fires at 00:00 Lagos (23:00 UTC), so
// at run time `now` sits on the next day's boundary.
export const LAGOS_OFFSET_MS = 60 * 60 * 1000;

// A cron that fires a minute early must still report the day it was aimed
// at, so the boundary is read as if the run were slightly in the future.
const LAGOS_RUN_GRACE_MS = 2 * 60 * 1000;

export function lagosDayWindow(now = new Date()) {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS + LAGOS_RUN_GRACE_MS);
  const startOfToday = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate());
  const startOfDay = startOfToday - 24 * 60 * 60 * 1000;
  return {
    start: new Date(startOfDay - LAGOS_OFFSET_MS).toISOString(),
    end: new Date(startOfToday - LAGOS_OFFSET_MS).toISOString(),
    day: new Date(startOfDay).toISOString().slice(0, 10),
  };
}

// The day's orders as one message. Each row carries the latest invoice
// total (null when none was written) and the order's price_status.
// Capped so a freak day cannot push the text past Telegram's 4096 limit.
export const DAILY_REPORT_MAX_LINES = 30;

export function dailyReportText(rows, span) {
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const head = `Daily report - ${span.day}`;
  if (!list.length) return `${head}\n\nNo orders today.`;
  const priced = list.filter(r => r.price_status === 'priced' && r.total != null);
  const revenue = priced.reduce((sum, r) => sum + Number(r.total || 0), 0);
  const shown = list.slice(0, DAILY_REPORT_MAX_LINES);
  return [
    head,
    `${list.length} order${list.length === 1 ? '' : 's'}, ${priced.length} priced` +
      (list.length > priced.length ? `, ${list.length - priced.length} pending` : ''),
    `Revenue: ${money(revenue)}`,
    '',
    ...shown.map(r => `${r.order_number} - ${r.name || 'no name'} - ` +
      (r.price_status === 'priced' && r.total != null ? money(r.total) : 'price pending')),
    list.length > shown.length ? `+${list.length - shown.length} more` : null,
  ].filter(v => v !== null).join('\n');
}

// "/editinvoice@Lacremeuyobot 20261109-131600456-TB" -> { command, args }.
// The @suffix is how Telegram addresses a bot in a group, and the command
// must still be recognised there.
export function parseCommand(text) {
  const s = String(text || '').trim();
  if (!s.startsWith('/')) return null;
  const [head, ...rest] = s.split(/\s+/);
  const command = head.slice(1).split('@')[0].toLowerCase();
  return { command, args: rest.join(' ').trim() };
}

// "2 = 4500", "2=NGN 4,500" and "2 = -" (back to unpriced). A bare number is
// rejected rather than guessed at: with two numbers in play, guessing which
// is the line and which is the price is how the wrong line gets priced.
export function parsePriceEntry(text) {
  const s = String(text || '').trim();
  const m = s.match(/^(\d{1,3})\s*=\s*(.+)$/);
  if (!m) {
    return { error: 'Send it as 2 = 4500 - line number, equals, price. Use 2 = - to mark it unpriced.' };
  }
  const index = Number(m[1]);
  if (!Number.isInteger(index) || index < 1) {
    return { error: 'That line number is not valid.' };
  }
  const raw = m[2].trim();
  if (raw === '-') return { index, price: null };

  // Accept "4500", "NGN 4,500" and the legacy "₦4,500" alike: strip the
  // currency token and separators, then insist on digits.
  const digits = raw.replace(/^ngn/i, '').replace(/[\s,₦]/g, '');
  if (!/^\d+(\.\d+)?$/.test(digits)) {
    return { error: 'That price is not a number. Send 2 = 4500, or 2 = - to leave it unpriced.' };
  }
  const price = Math.round(Number(digits));
  if (price < 1) return { error: 'A price has to be at least NGN 1. Use 2 = - to leave it unpriced.' };
  if (price > MAX_PRICE) return { error: `That price looks too large - the ceiling is ${money(MAX_PRICE)}.` };
  return { index, price };
}

// Order numbers are generated by the site as YYYYMMDD-HHMMSSmmm-II. Accept
// one with or without punctuation noise, but never invent a partial match.
export function parseOrderNumber(text) {
  const s = String(text || '').trim().toUpperCase();
  const m = s.match(/^[A-Z0-9][A-Z0-9-]{6,40}$/);
  return m ? s : null;
}

// One numbered line per row. Prices are the whole point, so an unpriced
// line says so rather than showing nothing.
export function formatLines(lines) {
  if (!lines.length) return '(no line items)';
  return lines.map((l, i) => {
    const amount = l.p === null ? 'unpriced' : `${money(l.q * l.p)}${l.q > 1 ? ` (${money(l.p)} x ${l.q})` : ''}`;
    return `${i + 1}. ${l.d} - ${amount}`;
  }).join('\n');
}

// The confirmation card (constraint: show current and proposed before
// anything is written). The WARNING block is why a human is asked at all.
export function formatPriceCard({ orderNo, index, line, oldP, newP, newTotal, unpriced, catalogue }) {
  const current = oldP === null ? 'unpriced' : money(oldP);
  const proposed = newP === null ? 'unpriced' : money(newP);
  return [
    // Plain text throughout: replies go out with no parse_mode, because a
    // description from the site may contain * or _ and would otherwise make
    // Telegram reject the message.
    `CONFIRM PRICE CHANGE`,
    ``,
    `Order ${orderNo}`,
    `Line ${index + 1}: ${line.d}${line.q > 1 ? ` x${line.q}` : ''}`,
    ``,
    `Current: ${current}`,
    `Proposed: ${proposed}`,
    `Order total after: ${newTotal}${unpriced ? ` (plus ${unpriced} unpriced line${unpriced > 1 ? 's' : ''})` : ''}`,
    ``,
    catalogue
      ? 'Save price also remembers this for future identical orders.'
      : 'No catalogue key for this line, so it can only be set on this order.',
    ``,
    'Nothing has been saved yet.',
  ].join('\n');
}

export function formatApproveCard({ orderNo, total, version, unpriced }) {
  const head = [
    `APPROVE INVOICE`,
    ``,
    `Order ${orderNo}`,
    `Version ${version}`,
    `Total ${total}`,
  ];
  if (unpriced.length) {
    return [
      ...head,
      ``,
      `CANNOT APPROVE YET - ${unpriced.length} line${unpriced.length > 1 ? 's are' : ' is'} still unpriced:`,
      ...unpriced.map(n => `- line ${n}`),
      ``,
      'Set those prices first with /editinvoice.',
    ].join('\n');
  }
  return [...head, ``, 'Approving marks this invoice final and sends the PDF again.'].join('\n');
}

export function newQuoteId() {
  const bytes = new Uint8Array(QUOTE_ID_CHARS / 2);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function callbackData(scope, quote) {
  return `q:${scope}:${quote}`;
}

export function parseCallbackData(data) {
  const m = String(data || '').match(/^q:(save|once|approve|cancel):([a-f0-9]{8})$/);
  return m ? { scope: m[1], quote: m[2] } : null;
}

// Spec §5.3 key format. Only a cake with a spec_key has a catalogue key:
// a custom or wedding cake returns null, which is what keeps a bespoke
// quotation from ever becoming the standing price (constraint: order
// price changes must not leak into the general catalogue).
export function catalogueKeyFor(order, line) {
  if (!order || !order.spec_key) return null;
  if (!/cake/i.test(String(order.order_type || ''))) return null;
  return `cake:${order.spec_key}`;
}

// Spec §8: /updateprice is owner-tier only. Chat-id based, like every other
// bot authorisation — a group does not inherit admin rights by membership.
export function isOwnerChat(env, chatId) {
  return parseInvoiceChatIds(env && env.TELEGRAM_OWNER_CHAT_IDS).includes(String(chatId));
}

// `/updateprice afang:10L 1 = 62000` → one catalogue row to write, or an
// error. Mirrors parsePriceEntry's grammar so operators type one format:
// "key price" with an optional "n =" in front, and "-" to clear.
export function parseUpdatePrice(args) {
  const s = String(args || '').trim();
  if (!s) return { error: `Send it as: /updateprice afang:10L 1 = 62000${UPDATE_PRICE_HINT}` };
  // "<key>", then the price, which may carry parsePriceEntry's optional
  // "<n> =" prefix. The key is taken as typed, NOT lowercased: it is a
  // lookup into product_prices ('afang:10L'), and "afang:10l" would just
  // report "no such item".
  const [key, ...priceParts] = s.split(/\s+/);
  const rest = priceParts.join(' ').replace(/^\d{1,3}\s*=\s*/, '');
  if (!rest) return { error: `Send it as: /updateprice afang:10L 62000${UPDATE_PRICE_HINT}` };

  const itemKey = key;
  const index = 1;
  const priceText = rest;
  const parsed = parsePriceEntry(`${index} = ${priceText}`);
  if (parsed.error) return { error: parsed.error };
  if (parsed.price === null) return { error: 'A catalogue price cannot be cleared - send a number instead.' };
  return { itemKey, price: parsed.price };
}

export const UPDATE_PRICE_HINT =
  '\nSend /prices to see the categories, then /prices soups for the exact keys.';

// A short label for product_prices.label: the catalogue shows this, and a
// full invoice description ("Birthday cake, 2 Tiers, Vanilla") is too long
// to be a menu row.
export function catalogueLabel(order, line) {
  const desc = String((line && line.d) || '').trim();
  return desc.slice(0, 120);
}
