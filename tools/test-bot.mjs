/* Unit tests for worker/bot.js — the conversation's pure helpers.

   No database, no network: parsing what an operator typed and formatting
   what they read are exactly the parts worth pinning down.

   Run:  node tools/test-bot.mjs
*/
import * as B from '../worker/bot.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

// --- commands -----------------------------------------------------------
eq('command plain', B.parseCommand('/edit-invoice'), { command: 'edit-invoice', args: '' });
eq('command @suffix in groups', B.parseCommand('/approve@Mekabot 20261109-131600456-TB'),
  { command: 'approve', args: '20261109-131600456-TB' });
eq('command text is not a command', B.parseCommand('hello'), null);

// --- price entry --------------------------------------------------------
eq('price plain', B.parsePriceEntry('2 = 4500'), { index: 2, price: 4500 });
eq('price with naira and comma', B.parsePriceEntry('2=₦4,500'), { index: 2, price: 4500 });
eq('price clear', B.parsePriceEntry('2 = -'), { index: 2, price: null });
eq('bare number is not guessed at', !!B.parsePriceEntry('4500').error, true);
eq('line zero rejected', !!B.parsePriceEntry('0 = 5').error, true);
eq('over the ceiling rejected', !!B.parsePriceEntry('2 = 999999999').error, true);
eq('non-numeric rejected', !!B.parsePriceEntry('2 = abc').error, true);
eq('decimals round', B.parsePriceEntry('2 = 4500.4'), { index: 2, price: 4500 });

// --- formatting ---------------------------------------------------------
eq('money', B.money(1234567), '₦1,234,567');
eq('order number normalises', B.parseOrderNumber(' 20261109-131600456-tb '), '20261109-131600456-TB');
eq('order number rejects junk', B.parseOrderNumber('hi'), null);
eq('line list', B.formatLines([{ d: 'Cake', q: 1, p: null }, { d: 'Puff Puff', q: 2, p: 1500 }]),
  '1. Cake — unpriced\n2. Puff Puff — ₦3,000 (₦1,500 × 2)');

const card = B.formatPriceCard({
  orderNo: 'X-1', index: 0, line: { d: 'Cake', q: 1, p: null },
  oldP: null, newP: 4500, newTotal: '₦7,500', unpriced: 0, catalogue: true,
});
eq('card shows current', card.includes('Current: unpriced'), true);
eq('card shows proposed', card.includes('Proposed: ₦4,500'), true);
eq('card says nothing saved yet', card.includes('Nothing has been saved yet.'), true);

// --- callbacks ----------------------------------------------------------
const q = B.newQuoteId();
eq('quote id shape', /^[a-f0-9]{8}$/.test(q), true);
eq('callback round trip', B.parseCallbackData(B.callbackData('save', q)), { scope: 'save', quote: q });
eq('callback rejects a short quote', B.parseCallbackData('q:save:zzz'), null);
eq('callback rejects unknown scope', B.parseCallbackData('q:drop:' + q), null);

// --- catalogue key: what may and may not touch the general price --------
const lines = [{ d: 'Cake', q: 1, p: null }];
eq('cake key', B.catalogueKeyFor({ order_type: 'Cake', spec_key: 'tiers|flavour' }, lines[0]),
  'cake:tiers|flavour');
eq('custom cake has no key', B.catalogueKeyFor({ order_type: 'Cake', spec_key: null }, lines[0]), null);
eq('non-cake has no key', B.catalogueKeyFor({ order_type: 'Finger Foods', spec_key: null }, lines[0]), null);

// --- approval gating ----------------------------------------------------
const refused = B.formatApproveCard({ orderNo: 'X-1', total: 'price on request', version: 2, unpriced: [1, 3] });
eq('approve card refuses while unpriced', refused.includes('CANNOT APPROVE YET'), true);
eq('approve card names the lines', refused.includes('line 1') && refused.includes('line 3'), true);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
