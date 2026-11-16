/* R3.4 — catalogue pricing on order creation, including the two security
   rules added after R3.5:

   1. Fail closed. Every line's price is blanked before pricing, so a D1
      failure leaves the order pending instead of invoicing whatever the
      request claimed. The client is never a price source.
   2. Keys are not trusted. A menu line is priced from the catalogue row
      its own description names — the text the invoice prints — so a
      cheaper key on the line cannot change what it costs.

   Posts real order bodies at the Worker's /api/orders with a stubbed D1,
   then reads back what would have been stored.

   Run: node tools/test-catalogue-price.mjs
*/
const mod = await import('../worker/index.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

const SPEC = '2 tiers, 3 tiers|step 0: 8" — 2 layers ; step 1: 10" — 3 layers|vanilla|fondant';
const CAKE_KEY = `cake:${SPEC}`;

// The catalogue as the Worker sees it: rows with a label, a category and
// a price. The menu lookup filters out cake rows exactly as the real SQL
// does, so the exclusion is exercised rather than assumed.
const MENU = [
  { item_key: 'afang:5L', category: 'soups', label: 'Afang Soup - 5L', price: 30000 },
  { item_key: 'afang:10L', category: 'soups', label: 'Afang Soup - 10L', price: 60000 },
  { item_key: 'jollof:Tray-Classic', category: 'rice', label: 'Jollof Rice - Tray (Classic)', price: 24000 },
  { item_key: 'jollof:Tray-Standard', category: 'rice', label: 'Jollof Rice - Tray (Standard)', price: 20000 },
  { item_key: 'chicken', category: 'catering', label: 'Chicken', price: 2500 },
  { item_key: 'sc-plate-standard', category: 'finger-foods', label: 'Small Chops - Plate (Standard)', price: 2500 },
  { item_key: 'sc-plate-classic', category: 'finger-foods', label: 'Small Chops - Plate (Classic)', price: 4000 },
  { item_key: 'meat-pie', category: 'finger-foods', label: 'Meat Pie', price: 1000 },
  { item_key: 'cake-thing', category: 'cakes', label: 'Birthday cake, 2 tiers, vanilla', price: 45000 },
];

function makeEnv({
  cakePrice = 45000,
  catalogue = MENU,
  throwOnCake = false,
  throwOnMenu = false,
} = {}) {
  const calls = [];
  const env = { calls };
  const prepare = (sql) => ({
    bind: (...a) => {
      calls.push({ sql, args: a, bound: true });
      return {
        run: async () => ({ meta: { changes: 1 } }),
        all: async () => ({ results: [] }),
        first: async () => {
          calls.push({ sql, args: a, bound: true, first: true });
          if (!/SELECT price FROM product_prices WHERE item_key/.test(sql)) return null;
          if (throwOnCake) throw new Error('d1 down');
          return cakePrice != null && a[0] === CAKE_KEY ? { price: cakePrice } : null;
        },
      };
    },
    run: async () => ({ meta: { changes: 1 } }),
    // The menu lookup is the one query issued without bind().
    all: async () => {
      calls.push({ sql, args: [], bound: false });
      if (!/FROM product_prices/.test(sql)) return { results: [] };
      if (throwOnMenu) throw new Error('d1 down');
      const cakeExcluded = /category <>/ .test(sql);
      return {
        results: catalogue.filter((r) => !(cakeExcluded && r.category === 'cakes')),
      };
    },
    first: async () => null,
  });
  env.DB = { prepare };
  return { env, calls };
}

let seq = 0;
const body = (over = {}) => JSON.stringify({
  orderNumber: `20261116-${String(120000000 + (seq++)).padStart(9, '0')}-TB`,
  orderType: 'Catering', name: 'Test', phone: '08012345678',
  lines: [],
  ...over,
});

async function post(made, over) {
  const res = await mod.default.fetch(new Request('https://x/api/orders', {
    method: 'POST', body: body(over), headers: { 'content-type': 'text/plain' },
  }), made.env, { waitUntil() {} });
  const insert = [...made.env.calls].reverse().find((c) => /INSERT OR IGNORE INTO orders/.test(c.sql));
  const cols = insert.sql.match(/\(([^)]*)\)\s*VALUES/)[1].split(',').map((s) => s.trim());
  const at = (n) => insert.args[cols.indexOf(n)];
  const version = [...made.env.calls].reverse()
    .find((c) => /INSERT (OR IGNORE )?INTO invoice_versions/.test(c.sql));
  return {
    res,
    lines: JSON.parse(at('lines_json')),
    status: at('price_status'),
    // The version insert binds (order_number, created_at, lines_json,
    // total) — total is the last bound parameter.
    versionTotal: version ? Number(version.args[version.args.length - 1]) : null,
    calls: made.env.calls,
  };
}

const line = (over) => ({ d: 'Meat Pie', q: 1, p: null, ...over });

/* ======================================================================
   The happy path: description and catalogue agree
   ====================================================================== */

{
  const made = makeEnv();
  const r = await post(made, {
    lines: [
      line({ d: 'Afang Soup, 10L, Goat meat', q: 1, k: 'afang:10L', p: 1 }),
      line({ d: 'Jollof Rice, Tray, Classic, Salad', q: 2, k: 'jollof:Tray-Classic', p: 0 }),
      line({ d: 'Meat Pie', q: 3, k: 'meat-pie', p: 999999 }),
      line({ d: 'Chicken', q: 1, k: 'chicken', p: 500 }),
    ],
  });
  eq('soup: priced from the catalogue', r.lines[0].p, 60000);
  eq('rice: priced from the catalogue (sides ignored)', r.lines[1].p, 24000);
  eq('finger food: priced from the catalogue', r.lines[2].p, 1000);
  eq('protein: priced from the catalogue', r.lines[3].p, 2500);
  eq('the order is priced', r.status, 'priced');
  eq('one menu query for the whole order', r.calls.filter((c) => /FROM product_prices/.test(c.sql) && !c.bound).length, 1);
}

/* ======================================================================
   Rule 1 — fail closed. A D1 failure never falls back to the request.
   ====================================================================== */

{
  const made = makeEnv({ throwOnMenu: true });
  const r = await post(made, {
    lines: [line({ d: 'Afang Soup, 10L, Goat meat', k: 'afang:10L', p: 99999 })],
  });
  eq('menu read fails: the sent price is not kept', r.lines[0].p, null);
  eq('menu read fails: the order waits for a human', r.status, 'pending');
  eq('menu read fails: the order is still accepted', r.res.status, 200);
}

{
  const made = makeEnv({ throwOnCake: true });
  const r = await post(made, {
    orderType: 'Cake', specKey: SPEC,
    lines: [line({ d: 'Birthday cake, 2 tiers, vanilla', p: 1000, cake: true })],
  });
  eq('cake read fails: the sent price is not kept', r.lines[0].p, null);
  eq('cake read fails: the order waits for a human', r.status, 'pending');
}

{
  const made = makeEnv();
  const r = await post(made, {
    lines: [line({ d: 'Something not in the catalogue', p: 5000 })],
  });
  eq('an unkeyed, unmatched line is pending, never the sent price', r.lines[0].p, null);
  eq('and holds the order', r.status, 'pending');
}

/* ======================================================================
   Rule 2 — the key is not a price source
   ====================================================================== */

{
  const made = makeEnv();
  const r = await post(made, {
    lines: [line({ d: 'Afang Soup, 10L, Goat meat', k: 'afang:5L', p: 1 })],
  });
  eq('a cheaper key on a 10L line does not set the price', r.lines[0].p, 60000);
  eq('and the order is still priced', r.status, 'priced');
}

{
  const made = makeEnv();
  const r = await post(made, {
    lines: [line({ d: 'Afang Soup, 5L, Fish', k: 'afang:10L', p: 60000 })],
  });
  eq('an expensive key on a 5L line does not overcharge', r.lines[0].p, 30000);
}

{
  // The collision that matters: a soup's protein is the last word of its
  // description, and "Beef" is also a catalogue row of its own.
  const made = makeEnv();
  const r = await post(made, {
    lines: [line({ d: 'Egusi Soup, 10L, Beef', k: 'egusi:10L', p: 56000 })],
  });
  eq('a missing soup is pending, not priced as its protein', r.lines[0].p, null);
  eq('and the order waits', r.status, 'pending');
}

{
  const made = makeEnv();
  const r = await post(made, {
    lines: [line({ d: 'Afang Soup, 10L, Chicken', k: 'afang:10L' })],
  });
  eq('a protein word inside a soup line does not hijack the price', r.lines[0].p, 60000);
}

{
  const made = makeEnv();
  const r = await post(made, {
    lines: [line({ d: 'Afang Soup, Goat meat', k: 'afang:10L', p: 60000 })],
  });
  eq('a soup line with no size named is pending', r.lines[0].p, null);
}

{
  const made = makeEnv();
  const r = await post(made, {
    lines: [line({ d: 'Jollof Rice, Tray, Standard', k: 'jollof:Tray-Classic', p: 1 })],
  });
  eq('a standard tray is not priced as the classic one', r.lines[0].p, 20000);
}

{
  const made = makeEnv({
    catalogue: [
      ...MENU,
      { item_key: 'afang', category: 'soups', label: 'Afang Soup', price: 1000 },
    ],
  });
  const r = await post(made, {
    lines: [line({ d: 'Afang Soup, 10L, Goat meat', k: 'afang' })],
  });
  eq('the most specific label wins', r.lines[0].p, 60000);
}

{
  const made = makeEnv({
    catalogue: [
      { item_key: 'twina', category: 'soups', label: 'Afang Soup', price: 1000 },
      { item_key: 'twinb', category: 'soups', label: 'Afang Soup', price: 2000 },
    ],
  });
  const r = await post(made, { lines: [line({ d: 'Afang Soup, 10L' })] });
  eq('two equally specific rows are ambiguous, so pending', r.lines[0].p, null);
}

{
  const made = makeEnv();
  const r = await post(made, {
    lines: [line({ d: 'Birthday cake, 2 tiers, vanilla', p: 1 })],
  });
  eq('a cake catalogue row never prices a menu line', r.lines[0].p, null);
}

{
  const made = makeEnv({
    catalogue: [{ item_key: 'x', category: 'soups', label: '', price: 100 }],
  });
  const r = await post(made, { lines: [line({ d: 'Mystery Soup, 10L' })] });
  eq('a row with no label cannot be matched', r.lines[0].p, null);
}

{
  const made = makeEnv({
    catalogue: [{ item_key: 'x', category: 'soups', label: 'Mystery Soup - 10L', price: 0 }],
  });
  const r = await post(made, { lines: [line({ d: 'Mystery Soup, 10L' })] });
  eq('a row with a zero price is not a price', r.lines[0].p, null);
}

/* ======================================================================
   Cakes — spec key pricing, still fail-closed
   ====================================================================== */

{
  const made = makeEnv({ cakePrice: 45000 });
  const r = await post(made, {
    orderType: 'Cake', specKey: SPEC,
    lines: [line({ d: 'Birthday cake, 2 tiers, vanilla', p: 1000, cake: true })],
  });
  eq('a repeat cake is priced from the spec key, not the sent price', r.lines[0].p, 45000);
  eq('the cake marker is kept', r.lines[0].cake, true);
  eq('the cake order is priced', r.status, 'priced');
}

{
  const made = makeEnv({ cakePrice: 45000 });
  const r = await post(made, {
    orderType: 'Cake', specKey: null,
    lines: [line({ d: 'Wedding cake, 3 tiers, vanilla', p: 1000, cake: true })],
  });
  eq('a cake with no spec key is pending, not the sent price', r.lines[0].p, null);
}

{
  const made = makeEnv({ cakePrice: 45000 });
  const r = await post(made, {
    orderType: 'Catering', specKey: SPEC,
    lines: [line({ d: 'Birthday cake, 2 tiers, vanilla', p: 1000, cake: true })],
  });
  eq('a cake marker on a non-cake order is not priced from the cake catalogue', r.lines[0].p, null);
}

{
  const made = makeEnv();
  const r = await post(made, {
    orderType: 'Cake + Catering', specKey: SPEC,
    lines: [
      line({ d: 'Birthday cake, 2 tiers, vanilla', cake: true }),
      line({ d: 'Meat Pie', q: 2, k: 'meat-pie', p: 1 }),
    ],
  });
  eq('mixed: the cake is spec-priced', r.lines[0].p, 45000);
  eq('mixed: the menu line is description-priced', r.lines[1].p, 1000);
  eq('mixed: priced overall', r.status, 'priced');
}

/* ======================================================================
   Storage consistency — the invoice is built from the priced lines
   ====================================================================== */

{
  const made = makeEnv();
  const r = await post(made, {
    lines: [
      line({ d: 'Afang Soup, 10L, Goat meat', q: 1, k: 'afang:10L', p: 1 }),
      line({ d: 'Egusi Soup, 10L, Beef', q: 1, k: 'egusi:10L', p: 56000 }),
    ],
  });
  eq('one unpriced line holds the whole order', r.status, 'pending');
  eq('the priced line keeps its catalogue price', r.lines[0].p, 60000);
  eq('the unmatched line is null, not the sent price', r.lines[1].p, null);
  eq('the invoice version totals only the priced lines', r.versionTotal, 60000);
  eq('the claimed key is kept for audit', r.lines[0].k, 'afang:10L');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
