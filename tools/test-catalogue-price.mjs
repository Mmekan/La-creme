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

function makeEnv({ price = 45000, throwOnPrice = false } = {}) {
  const calls = [];
  const env = { calls };
  // The lookup goes through .bind().first(); everything else only needs a
  // no-op, so a single bind() covers the whole handler.
  env.DB = {
    prepare(sql) {
      return {
        bind: (...a) => {
          calls.push({ sql, args: a });
          return {
            run: async () => ({ meta: { changes: 1 } }),
            all: async () => ({ results: [] }),
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

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
