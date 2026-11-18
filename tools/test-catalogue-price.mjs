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
  throwOnStaff = false,
  staff = [],
} = {}) {
  const calls = [];
  const env = { calls };
  // Only `settings` needs to remember, and only the rotation counter does.
  const settings = new Map();
  const prepare = (sql) => ({
    bind: (...a) => {
      calls.push({ sql, args: a, bound: true });
      return {
        run: async () => {
          if (/INTO settings/.test(sql)) settings.set(a[0], a[1]);
          return { meta: { changes: 1 } };
        },
        // The rate limiter reads COUNT(*) through bind(); a bare [] made it
        // throw. Nothing has been counted yet, so 0 is the truthful answer.
        all: async () => ({ results: [{ n: 0 }] }),
        first: async () => {
          calls.push({ sql, args: a, bound: true, first: true });
          if (/FROM settings WHERE key/.test(sql)) {
            return settings.has(a[0]) ? { value: settings.get(a[0]) } : null;
          }
          if (!/SELECT price FROM product_prices WHERE item_key/.test(sql)) return null;
          if (throwOnCake) throw new Error('d1 down');
          return cakePrice != null && a[0] === CAKE_KEY ? { price: cakePrice } : null;
        },
      };
    },
    run: async () => ({ meta: { changes: 1 } }),
    // The menu and staff lookups are the queries issued without bind().
    all: async () => {
      calls.push({ sql, args: [], bound: false });
      if (/FROM staff WHERE active = 1/.test(sql)) {
        if (throwOnStaff) throw new Error('d1 down');
        return { results: staff };
      }
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
    assignedTo: at('assigned_to'),
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

/* ======================================================================
   Guards added for the deploy: auth fails closed, orders are rate limited
   ====================================================================== */

// A D1 stub whose COUNT returns whatever the limiter should see.
function countedEnv(n) {
  const prepare = (sql) => ({
    bind: (...a) => ({
      run: async () => ({ meta: { changes: 1 } }),
      all: async () => ({ results: [{ n }] }),
      first: async () => null,
    }),
    run: async () => ({ meta: { changes: 1 } }),
    all: async () => ({ results: [] }),
    first: async () => null,
  });
  return { DB: { prepare } };
}

const req = (path, init = {}, headers = {}) =>
  new Request(`https://x${path}`, { ...init, headers: { 'content-type': 'application/json', ...headers } });
const nothing = { waitUntil() {} };

{
  // Unset secrets used to make the password the literal string "undefined".
  const env = countedEnv(0);
  env.SESSION_SECRET = 's';
  const r = await mod.default.fetch(
    req('/api/login', { method: 'POST', body: JSON.stringify({ password: 'undefined' }) }), env, nothing);
  eq('login refuses when ADMIN_PASSWORD is unset', r.status, 503);
  eq('login returns no token in that case', await r.json(), { error: 'Login is not configured.' });
}

{
  const env = countedEnv(0);
  const r = await mod.default.fetch(
    req('/api/orders', { method: 'GET' }, { Authorization: 'Bearer 9999999999999.x' }), env, nothing);
  eq('a token cannot verify when SESSION_SECRET is unset', r.status, 401);
}

{
// 5 per device per 20 minutes is the ceiling, per the owner's choice.
const env = countedEnv(5);
  const r = await mod.default.fetch(
    req('/api/orders', { method: 'POST', body: body({ lines: [] }) }), env, nothing);
  eq('the 6th order in the window is refused', r.status, 429);
const spent = countedEnv(4);
  const ok = await mod.default.fetch(
    req('/api/orders', { method: 'POST', body: body({ lines: [] }) }), spent, nothing);
  eq('order 5 is still accepted', ok.status, 200);
}

/* ======================================================================
   Staff rotation — the round robin over the roster
   ====================================================================== */

{
  const staff = [{ chat_id: '111', name: 'Ada' }, { chat_id: '222', name: 'Bola' }];
  const made = makeEnv({ staff });
  const a = await post(made, { lines: [line({ d: 'Meat Pie' })] });
  const b = await post(made, { lines: [line({ d: 'Meat Pie' })] });
  const c = await post(made, { lines: [line({ d: 'Meat Pie' })] });
  eq('the first order goes to the first rep', a.assignedTo, 'Ada');
  eq('the second goes to the next rep', b.assignedTo, 'Bola');
  eq('the third wraps back round', c.assignedTo, 'Ada');
  eq('the name is stored, not the chat id', c.assignedTo !== '111', true);
}

{
  // An empty roster is not an error: the order lands unowned.
  const made = makeEnv();
  const r = await post(made, { lines: [line({ d: 'Meat Pie' })] });
  eq('no rep: the order is unassigned', r.assignedTo, null);
  eq('no rep: the order is still accepted', r.res.status, 200);
  eq('no rep: nothing is written to the rotation counter',
    r.calls.filter((x) => /INTO settings/.test(x.sql)).length, 0);
}

{
  // A broken roster must not cost a sale.
  const made = makeEnv({ throwOnStaff: true });
  const r = await post(made, { lines: [line({ d: 'Meat Pie' })] });
  eq('roster read fails: the order is unassigned', r.assignedTo, null);
  eq('roster read fails: the order is still accepted', r.res.status, 200);
}

{
  // The admin list prints what the invoice is worth, not orders.total — the
  // visitor's own typed string, which reads "0" on a fully priced order.
  const hmacHex = async (secret, msg) => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  const exp = String(Date.now() + 60000);
  const token = `${exp}.${await hmacHex('s', exp)}`;

  const rows = [
    { order_number: 'A', total: '0', lines_json: JSON.stringify([
      { d: 'Meat Pie', q: 3, p: 1000 }, { d: 'Chicken', q: 2, p: 2500 }]) },
    { order_number: 'B', total: '25000', lines_json: JSON.stringify([
      { d: 'Meat Pie', q: 1, p: 1000 }, { d: 'Unknown Thing', q: 1, p: null }]) },
    { order_number: 'C', total: '40000', lines_json: JSON.stringify([
      { d: 'Unknown Thing', q: 1, p: null }]) },
    { order_number: 'D', total: '1000', lines_json: JSON.stringify([]) },
    { order_number: 'E', total: '', items: 'Meat Pie\nChicken' },
  ];
  const env = {
    SESSION_SECRET: 's',
    DB: {
      prepare: (sql) => ({
        bind: () => ({
          all: async () => ({ results: /COUNT\(\*\)/.test(sql) ? [{ n: rows.length }] : rows }),
        }),
      }),
    },
  };
  const res = await mod.default.fetch(
    req('/api/orders', { method: 'GET' }, { Authorization: `Bearer ${token}` }), env, nothing);
  eq('the authenticated list answers 200', res.status, 200);
  const listed = (await res.json()).orders;
  const pick = (n) => listed.find((o) => o.order_number === n);
  eq('a fully priced order reports the invoice figure, not the typed "0"',
    [pick('A').priced_total, pick('A').priced_unpriced], [8000, 0]);
  eq('a partly priced order reports its subtotal and its unpriced count',
    [pick('B').priced_total, pick('B').priced_unpriced], [1000, 1]);
  eq('a wholly unpriced order reports no figure at all',
    [pick('C').priced_total, pick('C').priced_unpriced], [null, 1]);
  eq('an order with no lines reports no figure either', pick('D').priced_total, null);
  eq('an order carrying only the items blob is read as unpriced lines',
    [pick('E').priced_total, pick('E').priced_unpriced], [null, 2]);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
