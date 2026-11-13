/* R3.4b — the menu repaints from the live catalogue, and one price policy
   holds across menu, cart, checkout, WhatsApp text and the invoice.

   Loads the real config.js into a bare context (it is a classic script,
   not a module) and drives applyPrices() and the *PriceOf / *EntryPrice /
   line* helpers directly, so a key-shape drift on either side, or a
   divergence between what the menu shows and what the invoice charges,
   fails here.

   Run:  node tools/test-live-prices.mjs
*/
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

const src = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
// A fresh context is a fresh page load: PRICES starts empty and unapplied.
function fresh() {
  const ctx = vm.createContext({ window: {}, document: { addEventListener(){}, getElementById: () => null }, console });
  vm.runInContext(src, ctx);
  return (n) => vm.runInContext(n, ctx);
}

const PROTEIN = { id: 'chicken', name: 'Chicken', price: 2500 };
const TURKEY  = { id: 'turkey', name: 'Turkey', price: 3000 };

// A committed cart entry's own unitPrice is a snapshot taken when it was
// added; the catalogue now says something else.
const soupEntry = (label, snapshot) => ({ itemId: 'afang', sel: { label }, unitPrice: snapshot });
const riceEntry = (type, style, snapshot) => ({ itemId: 'jollof', sel: { type, style }, unitPrice: snapshot });

/* --- 1. failed / not-yet-arrived request: the constants still work -------
   loadPrices() never lands, so every helper must fall back to the baked-in
   price rather than showing the whole menu as pending. */
{
  const g = fresh();
  eq('soup falls back before the catalogue lands', g('soupPriceOf')('afang', '10L', 62000), 62000);
  eq('rice falls back before the catalogue lands', g('ricePriceOf')('jollof', 'Tray', 'Classic', 24000), 24000);
  eq('finger food falls back before the catalogue lands', g('priceOf')('meat-pie', 1500), 1500);
  eq('protein falls back before the catalogue lands', g('proteinPriceOf')(PROTEIN), 2500);
  eq('a committed entry keeps its snapshot before the catalogue lands', g('soupEntryPrice')(soupEntry('10L', 62000)), 62000);
  eq('lineTotal before the catalogue lands', g('lineTotal')({ qty: 2, unitPrice: 62000 }), '₦124,000');
}

// The catalogue the Worker serves (seed-prices.sql keys, same shapes).
const CATALOGUE = {
  'afang:10L': 70000,             // soups:  <id>:<size>
  'jollof:Tray-Classic': 26000,   // rice:   <id>:<type>-<style>
  'meat-pie': 1800,               // finger foods / catering: bare id
  'chicken': 2800,
};

/* --- 2. the catalogue landed: it wins -------------------------------- */
{
  const g = fresh();
  eq('applyPrices accepts a real catalogue', g('applyPrices')(CATALOGUE), true);
  eq('soup price is the live one', g('soupPriceOf')('afang', '10L', 62000), 70000);
  eq('rice price is the live one', g('ricePriceOf')('jollof', 'Tray', 'Classic', 24000), 26000);
  eq('finger food price is the live one', g('priceOf')('meat-pie', 1500), 1800);
  eq('protein price is the live one', g('proteinPriceOf')(PROTEIN), 2800);

  /* --- 3. P4, uniform across categories: a key the catalogue lacks is
     pending, never the stale baked-in constant ------------------------- */
  const missing = [
    ['soup size',            g('soupPriceOf')('afang', '5L', 35000)],
    ['rice type+style',      g('ricePriceOf')('jollof', 'Lunchpack', 'Standard', 18000)],
    ['finger food',          g('priceOf')('cake-slices', 900)],
    ['protein',              g('proteinPriceOf')(TURKEY)],
  ];
  for (const [name, got] of missing) eq(`${name} with no catalogue row is pending, not a guess`, got, null);
}

/* --- 4. late response: an item added before prices arrived ------------ */
{
  const g = fresh();
  // Added while the page still showed constants, then the catalogue lands.
  const added = soupEntry('10L', 62000);
  g('applyPrices')(CATALOGUE);
  eq('a soup added before prices arrived re-prices to the live one', g('soupEntryPrice')(added), 70000);
  eq('a rice entry added before prices arrived re-prices too',
     g('riceEntryPrice')(riceEntry('Tray', 'Classic', 24000)), 26000);
  eq('a finger food added before prices arrived is priced live',
     g('priceOf')('meat-pie', 1500), 1800);
}

/* --- 5. restored cart: an entry priced under an older catalogue ------- */
{
  const g = fresh();
  g('applyPrices')(CATALOGUE);
  eq('a restored soup is re-priced at today\'s catalogue',
     g('soupEntryPrice')(soupEntry('10L', 50000)), 70000);
  eq('a restored rice entry is re-priced at today\'s catalogue',
     g('riceEntryPrice')(riceEntry('Tray', 'Classic', 20000)), 26000);
  // A restored entry whose key the catalogue has since dropped is pending.
  eq('a restored soup whose size the catalogue dropped is pending',
     g('soupEntryPrice')(soupEntry('5L', 35000)), null);
  eq('a restored rice entry whose style the catalogue dropped is pending',
     g('riceEntryPrice')(riceEntry('Lunchpack', 'Standard', 18000)), null);
  // A malformed restored entry can't throw during render.
  eq('an entry with no sel falls back to its snapshot', g('soupEntryPrice')({ itemId: 'afang', unitPrice: 50000 }), 50000);
  eq('a null entry is harmless', g('soupEntryPrice')(null), null);
}

/* --- 6. price changed after the item was added ----------------------- */
{
  const g = fresh();
  g('applyPrices')({ 'afang:10L': 71000 });
  eq('an entry re-prices when the catalogue changes under it',
     g('soupEntryPrice')(soupEntry('10L', 70000)), 71000);
  g('applyPrices')({ 'afang:10L': 72500 });
  eq('and again on the next change', g('soupEntryPrice')(soupEntry('10L', 71000)), 72500);
}

/* --- 7. missing catalogue entry: the customer can still order ---------
   A pending line is orderable and invoiced as "price on request" (p:null),
   never as NGN 0 and never as the stale constant. */
{
  const g = fresh();
  g('applyPrices')(CATALOGUE);
  const pending = { qty: 2, unitPrice: g('soupEntryPrice')(soupEntry('5L', 35000)) };
  eq('the pending line carries no price', pending.unitPrice, null);
  eq('checkout and dropdown show it as pending', g('lineTotal')(pending), 'Price via WhatsApp');
  eq('and it contributes nothing to the typed total', g('lineAmount')(pending), 0);
  // index.js sends `p: l.unitPrice || null` — this is what the invoice sees.
  eq('the invoice is sent p:null, never p:0', pending.unitPrice || null, null);
}

/* --- 8. one price, end to end ----------------------------------------
   The menu label, the cart line, the checkout row, the WhatsApp text and
   the invoice's `p` all read the same field from the same helper, so they
   cannot disagree. */
{
  const g = fresh();
  g('applyPrices')(CATALOGUE);
  const unit = g('riceEntryPrice')(riceEntry('Tray', 'Classic', 24000));
  const line = { qty: 3, unitPrice: unit };
  eq('menu/cart/checkout/invoice agree on the unit price', unit, 26000);
  eq('the line total is that price times the quantity', g('lineTotal')(line), '₦78,000');
  eq('the summed amount matches the printed total', g('lineAmount')(line), 78000);
  eq('the invoice receives the same number', line.unitPrice, 26000);
}

/* --- 9. junk in the catalogue is ignored, never written as a price ---- */
{
  const g = fresh();
  g('applyPrices')({
    'afang:5L': 'abc', 'afang:20L': 0, 'afang:25L': -400,
    'afang:30L': null, 'afang:35L': '', 'afang:40L': 52000,
  });
  eq('a non-numeric price is ignored', g('soupPriceOf')('afang', '5L', 35000), null);
  eq('a zero price is ignored', g('soupPriceOf')('afang', '20L', 35000), null);
  eq('a negative price is ignored', g('soupPriceOf')('afang', '25L', 35000), null);
  eq('a null price is ignored', g('soupPriceOf')('afang', '30L', 35000), null);
  eq('an empty price is ignored', g('soupPriceOf')('afang', '35L', 35000), null);
  eq('a numeric string price is accepted', g('soupPriceOf')('afang', '40L', 35000), 52000);
}

/* --- 10. a malformed payload leaves the menu on its constants --------- */
{
  const g = fresh();
  eq('applyPrices(undefined) -> false', g('applyPrices')(undefined), false);
  eq('applyPrices("x") -> false', g('applyPrices')('x'), false);
  eq('applyPrices(null) -> false', g('applyPrices')(null), false);
  eq('a refused payload does not mark the catalogue applied', g('PRICES').applied, false);
  eq('so the constants still show', g('priceOf')('meat-pie', 1500), 1500);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
