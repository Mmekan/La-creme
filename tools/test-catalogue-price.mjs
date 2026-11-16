/* R3.4 — a cake whose exact spec is in the catalogue is priced on arrival.

   Posts real order bodies at the Worker's /api/orders with a stubbed D1 that
   either holds the row or does not, then reads what would have been stored.

   Run:  node tools/test-catalogue-price.mjs
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

function makeEnv({
  price = 45000,
  throwOnPrice = false,
  catalogue = {}, // item_key -> price, for R3.4c's IN (...) lookup
  throwOnKeys = false,
} = {}) {
  const calls = [];
  const env = { calls };
  // Two catalogue reads exist now: .first() for the cake spec key and
  // .all() for the IN (...) list. Everything else only needs a no-op.
  env.DB = {
    prepare(sql) {
      return {
        bind: (...a) => {
          calls.push({ sql, args: a });
          return {
            run: async () => ({ meta: { changes: 1 } }),
            all: async () => {
              if (!/FROM product_prices WHERE item_key IN/.test(sql)) return { results: [] };
              if (throwOnKeys) throw new Error('d1 down');
              const results = a
                .filter(k => Object.prototype.hasOwnProperty.call(catalogue, k))
                .map(k => ({ item_key: k, price: catalogue[k] }));
              return { results };
            },
            first: async () => {
              if (!/FROM product_prices WHERE item_key/.test(sql)) return null;
              if (throwOnPrice) throw new Error('d1 down');
              return price != null && a[0] === CAKE_KEY ? { price } : null;
            },
          };
        },
        run: async () => ({ meta: { changes: 1 } }),
        all: async () => ({ results: [] }),
        first: async () => null,
      };
    },
  };
  return { env, calls };
}

// YYYYMMDD-<9 digits>-<initials>, matching ORDER_NO_RE in the Worker.
let seq = 0;
const body = (over = {}) => JSON.stringify({
  orderNumber: `20261113-${String(120000000 + (seq++)).padStart(9, '0')}-TB`,
  orderType: 'Cake', name: 'Test', phone: '08012345678',
  lines: [{ d: 'Birthday cake, 2 Tiers, 3 Tiers, Vanilla', q: 1, p: null }],
  ...over,
});

async function post({ env }, over) {
  const res = await mod.default.fetch(new Request('https://x/api/orders', {
    method: 'POST', body: body(over), headers: { 'content-type': 'text/plain' },
  }), env, { waitUntil() {} });
  const insert = [...env.calls].reverse().find(c => /INSERT OR IGNORE INTO orders/.test(c.sql));
  const cols = insert.sql.match(/\(([^)]*)\)\s*VALUES/)[1].split(',').map(s => s.trim());
  const at = (n) => insert.args[cols.indexOf(n)];
  return { res, lines: JSON.parse(at('lines_json')), status: at('price_status'), spec: at('spec_key') };
}

// Record every binding so post() can read back what was inserted.
let passWrap = 0;
const origPrepare = null;

// --- matching spec: priced, stored as such -----------------------------
{
  const made = makeEnv({ price: 45000 });
  const r = await post(made, { specKey: SPEC });
  eq('matching spec -> line is priced from the catalogue', r.lines[0].p, 45000);
  eq('matching spec -> order is priced, not pending', r.status, 'priced');
  eq('matching spec -> spec_key stored', r.spec, SPEC);
  eq('matching spec -> accepted', r.res.status, 200);
  eq('the catalogue was read with the cake: key', made.calls.some(c => c.args && c.args[0] === CAKE_KEY), true);
}

// --- no catalogue row: stays pending -----------------------------------
{
  const made = makeEnv({ price: null });
  const r = await post(made, { specKey: SPEC });
  eq('unknown spec -> still unpriced', r.lines[0].p, null);
  eq('unknown spec -> pending', r.status, 'pending');
}

// --- no spec key at all (custom / Wedding / multi-cake) ----------------
{
  const made = makeEnv({ price: 45000 });
  const r = await post(made, { specKey: null });
  eq('no spec key -> unpriced', r.lines[0].p, null);
  eq('no spec key -> pending', r.status, 'pending');
  eq('no spec key -> catalogue never queried', made.calls.some(c => c.sql.includes('product_prices WHERE item_key')), false);
}

// --- D1 read fails: pending, never invented ----------------------------
{
  const made = makeEnv({ throwOnPrice: true });
  const r = await post(made, { specKey: SPEC });
  eq('catalogue read fails -> unpriced', r.lines[0].p, null);
  eq('catalogue read fails -> pending', r.status, 'pending');
  eq('catalogue read fails -> order still accepted', r.res.status, 200);
}

// --- an already-priced line is never overwritten ------------------------
{
  const made = makeEnv({ price: 45000 });
  const r = await post(made, {
    specKey: SPEC,
    lines: [{ d: 'Birthday cake', q: 1, p: 30000 }],
  });
  eq('a line that arrived priced keeps its price', r.lines[0].p, 30000);
  eq('a line that arrived priced is not pending', r.status, 'priced');
}

// --- a non-cake order carrying a spec key is not priced ----------------
{
  const made = makeEnv({ price: 45000 });
  const r = await post(made, {
    specKey: SPEC, orderType: 'Catering',
    lines: [{ d: 'Afang Soup, 5L', q: 1, p: null }],
  });
  eq('non-cake order is not priced from the cake catalogue', r.lines[0].p, null);
}

/* ======================================================================
   R3.4c — every menu line carries its catalogue key, and the SERVER
   decides what it costs. The client's `p` is never trusted for a keyed
   line; a key the catalogue lacks is pending, exactly as the site shows.
   ====================================================================== */

const MENU = {
  'afang:10L': 62000,
  'jollof:Tray-Classic': 24000,
  'meat-pie': 1000,
  'chicken': 2500,
};

// --- keyed lines: catalogue price wins over whatever was sent ----------
{
  const made = makeEnv({ catalogue: MENU });
  const r = await post(made, {
    orderType: 'Finger Foods + Catering',
    lines: [
      { d: 'Afang Soup, 10L, Goat meat', q: 1, k: 'afang:10L', p: 1 },
      { d: 'Jollof Rice, Tray, Classic', q: 2, k: 'jollof:Tray-Classic', p: 0 },
      { d: 'Meat Pie', q: 3, k: 'meat-pie', p: 999999 },
      { d: 'Chicken', q: 1, k: 'chicken', p: 500 },
    ],
  });
  eq('keyed: soup is the catalogue price, not the sent one', r.lines[0].p, 62000);
  eq('keyed: rice is the catalogue price', r.lines[1].p, 24000);
  eq('keyed: a high sent price is replaced', r.lines[2].p, 1000);
  eq('keyed: a low sent price is replaced', r.lines[3].p, 2500);
  eq('keyed: the key is stored with the line', r.lines.map(l => l.k), [
    'afang:10L', 'jollof:Tray-Classic', 'meat-pie', 'chicken',
  ]);
  eq('keyed: order is priced', r.status, 'priced');
  const inQueries = made.calls.filter(c => /IN \(/.test(c.sql));
  eq('keyed: one lookup for the whole order, not one per line', inQueries.length, 1);
  eq('keyed: every distinct key is bound once', inQueries[0].args.length, 4);
}

// --- a key the catalogue lacks is pending, never the sent price ---------
{
  const made = makeEnv({ catalogue: MENU });
  const r = await post(made, {
    orderType: 'Catering',
    lines: [
      { d: 'Afang Soup, 5L, Fish', q: 1, k: 'afang:5L', p: 50000 },
      { d: 'Egusi Soup, 10L, Beef', q: 1, k: 'egusi:10L', p: 56000 },
    ],
  });
  eq('missing key: client price is not kept', r.lines[0].p, null);
  eq('missing key: pending, never a guessed price', r.status, 'pending');
}

// --- one missing key among priced ones still holds the whole order -----
{
  const made = makeEnv({ catalogue: MENU });
  const r = await post(made, {
    orderType: 'Finger Foods',
    lines: [
      { d: 'Meat Pie', q: 1, k: 'meat-pie', p: 1000 },
      { d: 'Cake Slices', q: 1, k: 'cake-slices', p: 3500 },
    ],
  });
  eq('mixed: the known key is priced', r.lines[0].p, 1000);
  eq('mixed: the unknown key is pending', r.lines[1].p, null);
  eq('mixed: order waits for a human', r.status, 'pending');
}

// --- D1 failure: keep what the client sent, still accept the order -----
{
  const made = makeEnv({ catalogue: MENU, throwOnKeys: true });
  const r = await post(made, {
    orderType: 'Finger Foods',
    lines: [{ d: 'Meat Pie', q: 1, k: 'meat-pie', p: 1200 }],
  });
  eq('key read fails: the sent price survives', r.lines[0].p, 1200);
  eq('key read fails: the order is still accepted', r.res.status, 200);
}

// --- no keys at all: unchanged (cake pricing is a separate rule) -------
{
  const made = makeEnv({ catalogue: MENU });
  const r = await post(made, {
    orderType: 'Finger Foods',
    lines: [{ d: 'Legacy line', q: 1, p: 1500 }],
  });
  eq('unkeyed: line keeps its price', r.lines[0].p, 1500);
  eq('unkeyed: catalogue is never read', made.calls.some(c => /product_prices/.test(c.sql)), false);
}

// --- a keyed order that is also a cake order: both rules apply ----------
{
  const made = makeEnv({ price: 45000, catalogue: MENU });
  const r = await post(made, {
    orderType: 'Cake + Catering', specKey: SPEC,
    lines: [
      { d: 'Birthday cake, 2 tiers', q: 1, p: null },
      { d: 'Meat Pie', q: 2, k: 'meat-pie', p: 1 },
    ],
  });
  eq('mixed cake+menu: the cake line is spec-priced', r.lines[0].p, 45000);
  eq('mixed cake+menu: the menu line is key-priced', r.lines[1].p, 1000);
  eq('mixed cake+menu: priced overall', r.status, 'priced');
}

// --- a malformed key is dropped, not stored ----------------------------
{
  const made = makeEnv({ catalogue: MENU });
  const r = await post(made, {
    orderType: 'Catering',
    lines: [
      { d: 'Control char key', q: 1, k: 'afang:10L\u0000drop', p: 1 },
      { d: 'Overlong key', q: 1, k: 'x'.repeat(300), p: 1 },
    ],
  });
  eq('bad key: control characters are not stored', r.lines[0].k, undefined);
  eq('bad key: an overlong key is clipped to 120', r.lines[1].k.length, 120);
  eq('bad key: neither line is priced from a key', r.status, 'pending');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
