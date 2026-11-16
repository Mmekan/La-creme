/* R3.5 — the real page, in a real browser, against a seeded local D1.

   What this covers that the stub tests cannot: the page's own fetch of
   /api/prices, the rendered chip labels, the cart dropdown, the WhatsApp
   text, and the exact body the browser sends to /api/orders.

   Prerequisites (nothing here is automated because it needs a running
   Worker on this machine):

     1. A local D1 with the schemas and worker/seed-prices.sql applied:
          cd worker
          npx wrangler d1 execute la-creme-orders --local --file=schema.sql
          npx wrangler d1 execute la-creme-orders --local --file=schema-invoice.sql
          npx wrangler d1 execute la-creme-orders --local --file=schema-pricing.sql
          npx wrangler d1 execute la-creme-orders --local --file=schema-bot.sql
          npx wrangler d1 execute la-creme-orders --local --file=seed-prices.sql
     2. The Worker:  npx wrangler dev --local --port 8792
     3. The site:    node tools/serve-test.mjs
     4. Playwright:  npm i -g playwright
        then run with  NODE_PATH="$(npm root -g)" node tools/test-browser.mjs

   --offline runs the other half: the site is served against a dead Worker
   port and must stay on its baked-in constants.
*/
import { createRequire } from 'node:module';

// `playwright` if it is installed; otherwise the copy bundled inside the
// global @playwright/cli package, which is what this machine has.
let chromium;
{
  const req = createRequire(import.meta.url);
  for (const id of ['playwright', '@playwright/cli/node_modules/playwright']) {
    try { ({ chromium } = req(id)); break; } catch (e) { /* try the next */ }
  }
  if (!chromium) {
    console.error('Playwright is not installed. Run: npm i -g playwright, then');
    console.error('NODE_PATH="$(npm root -g)" node tools/test-browser.mjs');
    process.exit(1);
  }
}

const OFFLINE = process.argv.includes('--offline');
const BASE = OFFLINE ? 'http://127.0.0.1:8898' : 'http://127.0.0.1:8899';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};
const ok = (name, cond, detail = '') => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name} ${detail}`); }
};

// The bundled build may not be downloaded; the system Chrome almost always
// is. Try Chrome first, then fall back.
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage();

await page.addInitScript(() => {
  // WhatsApp must not really open from a test.
  window.__opened = [];
  window.open = (url) => { window.__opened.push(String(url)); return { opener: null }; };
  // sendBeacon's body is not exposed to Playwright's request event, so
  // record it here and still send it for real.
  window.__beacons = [];
  const orig = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = (url, data) => {
    try {
      if (data && typeof data.text === 'function') {
        data.text().then((t) => window.__beacons.push({ url: String(url), body: t }));
      } else {
        window.__beacons.push({ url: String(url), body: String(data) });
      }
    } catch (e) { /* recording must not break the order */ }
    return orig(url, data);
  };
});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });

if (OFFLINE) {
  await page.waitForTimeout(2500); // give loadPrices() time to fail
  eq('the catalogue never applied', await page.evaluate(() => PRICES.applied), false);
  eq('Afang 10L keeps its baked-in price',
    (await page.locator('.menu-item[data-item-id="afang"] [data-role="size"] .liter-chip[data-label="10L"]').textContent()).trim(),
    '10L (₦60,000)');
  eq('Egusi 10L keeps its baked-in price',
    (await page.locator('.menu-item[data-item-id="egusi"] [data-role="size"] .liter-chip[data-label="10L"]').textContent()).trim(),
    '10L (₦56,000)');

  await page.locator('.menu-item[data-item-id="afang"] [data-role="size"] .liter-chip[data-label="10L"]').click();
  await page.locator('.menu-item[data-item-id="afang"] [data-role="protein"] .liter-chip[data-value="Fish"]').click();
  await page.locator('.menu-item[data-item-id="afang"] [data-role="add-btn"]').click();
  const cart = await page.evaluate(() => CART_SOURCES.cat.lines().map((l) => ({ key: l.key, unitPrice: l.unitPrice, total: lineTotal(l) })));
  eq('offline, the cart prices from the constant and still carries the key', cart,
    [{ key: 'afang:10L', unitPrice: 60000, total: '₦60,000' }]);
} else {
  await page.waitForFunction(() => typeof PRICES !== 'undefined' && PRICES.applied === true, null, { timeout: 15000 });
  eq('the page loaded with no errors', pageErrors, []);

  // The seeded catalogue says 30/60k; the seed test below changes 10L to
  // 70,000 with /update-price before running this.
  const afangChip = page.locator('.menu-item[data-item-id="afang"] [data-role="size"] .liter-chip[data-label="10L"]');
  eq('Afang 10L shows the catalogue figure', (await afangChip.textContent()).trim(), '10L (₦70,000)');
  const egusiChip = page.locator('.menu-item[data-item-id="egusi"] [data-role="size"] .liter-chip[data-label="10L"]');
  eq('a key removed from the catalogue shows no price', (await egusiChip.textContent()).trim(), '10L');

  await afangChip.click();
  await page.locator('.menu-item[data-item-id="afang"] [data-role="protein"] .liter-chip[data-value="Goat meat"]').click();
  await page.locator('.menu-item[data-item-id="afang"] [data-role="add-btn"]').click();

  await egusiChip.click();
  await page.locator('.menu-item[data-item-id="egusi"] [data-role="protein"] .liter-chip[data-value="Beef"]').click();
  ok('an unpriced size says the price is being confirmed',
    await page.locator('.menu-item[data-item-id="egusi"] [data-role="price"]').isVisible());
  await page.locator('.menu-item[data-item-id="egusi"] [data-role="add-btn"]').click();

  await page.locator('#ff-qty-meat-pie').locator('xpath=../..').locator('[data-act="inc"]').click();

  const cart = await page.evaluate(() => CART_SOURCES.cat.lines().map((l) => ({
    name: l.name, key: l.key, unitPrice: l.unitPrice, total: lineTotal(l),
  })));
  eq('cart: the priced soup carries its key and the catalogue price', cart[0],
    { name: 'Afang Soup, 10L, Goat meat', key: 'afang:10L', unitPrice: 70000, total: '₦70,000' });
  eq('cart: the unpriced soup is pending, not NGN 0', cart[1],
    { name: 'Egusi Soup, 10L, Beef', key: 'egusi:10L', unitPrice: null, total: 'Price via WhatsApp' });

  const ff = await page.evaluate(() => CART_SOURCES.ff.lines().map((l) => ({ key: l.key, unitPrice: l.unitPrice })));
  eq('cart: the finger food carries its key', ff, [{ key: 'meat-pie', unitPrice: 1000 }]);

  await page.locator('#cartIconBtn').click();
  const dropdown = await page.locator('#cartDropdownBody').innerText();
  ok('cart dropdown shows the live soup price', dropdown.includes('₦70,000'), dropdown);
  ok('cart dropdown shows the pending line as pending', dropdown.includes('Price via WhatsApp'), dropdown);

  // Clicking the in-dropdown button races the dropdown's own close, so
  // open the checkout the way the button does.
  await page.evaluate(() => openCheckoutModal());
  await page.selectOption('#checkoutEventType', 'Birthday');
  await page.fill('#checkoutGuests', '50');
  await page.fill('#checkoutDate', '2026-12-01');
  await page.locator('#checkoutDelivery .chip[data-value="Pickup"]').click();
  await page.fill('#checkoutName', 'Browser Test');
  await page.fill('#checkoutPhone', '08012345678');
  await page.locator('#checkoutForm button[type="submit"]').click();

  await page.waitForFunction(() => window.__opened.length > 0, null, { timeout: 10000 });
  const waText = decodeURIComponent((await page.evaluate(() => window.__opened[0])).split('?text=')[1] || '');
  ok('WhatsApp text prints the live soup price', waText.includes('₦70,000'), waText);
  ok('WhatsApp text prints the pending line as pending', waText.includes('Price via WhatsApp'), waText);
  ok('WhatsApp text carries the order number', /No\. \d{8}-\d{9}-BT/.test(waText), waText);

  await page.waitForFunction(() => window.__beacons.length > 0, null, { timeout: 10000 });
  const beacons = await page.evaluate(() => window.__beacons);
  eq('one order body was posted', beacons.length, 1);
  ok('the order went to /api/orders', beacons[0].url.endsWith('/api/orders'), beacons[0].url);
  const body = JSON.parse(beacons[0].body || '{}');
  const byKey = (k) => body.lines.find((l) => l.k === k) || {};
  eq('order: the soup line sends its catalogue key', byKey('afang:10L').k, 'afang:10L');
  eq('order: the soup line sends the catalogue price', byKey('afang:10L').p, 70000);
  eq('order: the unpriced soup sends no price', byKey('egusi:10L').p, null);
  eq('order: the unpriced soup still sends its key', byKey('egusi:10L').k, 'egusi:10L');
  eq('order: the finger-food line sends its key', byKey('meat-pie').k, 'meat-pie');
  eq('order: the finger-food line sends the catalogue price', byKey('meat-pie').p, 1000);
  eq('order: every line carries a key', body.lines.every((l) => typeof l.k === 'string'), true);
}

console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
