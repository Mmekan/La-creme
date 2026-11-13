/* R3.2 — the cake spec key, checked against the cake form's real shape.

   The key is defined twice on purpose: the site needs it to send with the
   order, the Worker needs it to look one up. The two copies can't import
   each other (config.js is a plain <script>), so the tests hold them to
   the same answers — if they drift, a repeat order silently stops matching
   its catalogue price.

   Run:  node tools/test-spec-key.mjs
*/
import * as B from '../worker/bot.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};
const neq = (name, a, b) => {
  if (a !== b) pass++;
  else { fail++; console.log(`FAIL ${name}\n  both ${JSON.stringify(a)}`); }
};

// The site's copy, lifted out of config.js and evaluated as it runs there.
const src = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const m = src.match(/function cakeSpecKey\(cake\)\{[\s\S]*?\n\}/);
if (!m) { console.log('FAIL cakeSpecKey not found in config.js'); process.exit(1); }
const cakeSpecKey = new Function(`${m[0]}; return cakeSpecKey;`)();

// Shape produced by validateCakeFields() in index.js.
const cake = (over = {}) => ({
  occasion: 'Birthday',
  tiersLabel: '2 Tiers, 3 Tiers',
  tierDetails: ['Step 0: 8" — 2 layers', 'Step 1: 10" — 3 layers'],
  flavor: 'Vanilla',
  finish: 'Fondant',
  inscription: '',
  design: '',
  ...over,
});

// --- both copies agree -------------------------------------------------
const cases = [
  cake(),
  cake({ occasion: 'Anniversary' }),
  cake({ occasion: 'Wedding' }),
  cake({ tiersLabel: 'Custom (3 Steps)', tierDetails: [] }),
  cake({ tierDetails: [] }),
  cake({ finish: '' }),
  cake({ tierDetails: ['Step 0: 8" — 2 layers'] }),
];
cases.forEach((c, i) => eq(`site and worker agree (#${i})`, cakeSpecKey(c), B.cakeSpecKey(c)));

// --- identical specification → identical key ---------------------------
eq('same cake, same key', cakeSpecKey(cake()), cakeSpecKey(cake()));
eq('whitespace and case are normalised',
  cakeSpecKey(cake({ flavor: '  VANILLA ' })), cakeSpecKey(cake({ flavor: 'vanilla' })));
eq('tier order on the form does not change the key',
  cakeSpecKey(cake()), cakeSpecKey(cake({ tierDetails: ['Step 1: 10" — 3 layers', 'Step 0: 8" — 2 layers'] })));
eq('occasion is excluded',
  cakeSpecKey(cake({ occasion: 'Birthday' })), cakeSpecKey(cake({ occasion: 'Graduation' })));
eq('date, inscription and design are excluded',
  cakeSpecKey(cake()), cakeSpecKey(cake({ inscription: 'Happy 30th', design: 'Floral cascade' })));

// --- different price-affecting specification → different key ----------
neq('different flavour', cakeSpecKey(cake()), cakeSpecKey(cake({ flavor: 'Chocolate' })));
neq('different finish', cakeSpecKey(cake()), cakeSpecKey(cake({ finish: 'Semi-Naked' })));
neq('no finish vs Fondant', cakeSpecKey(cake({ finish: '' })), cakeSpecKey(cake()));
neq('different inches (price-affecting)', cakeSpecKey(cake()),
  cakeSpecKey(cake({ tierDetails: ['Step 0: 8" — 2 layers', 'Step 1: 12" — 3 layers'] })));
neq('different layers', cakeSpecKey(cake()),
  cakeSpecKey(cake({ tierDetails: ['Step 0: 8" — 2 layers', 'Step 1: 10" — 4 layers'] })));
neq('different tier count', cakeSpecKey(cake({ tierDetails: ['Step 0: 8" — 2 layers'] })), cakeSpecKey(cake()));

// --- pending-price behaviour ------------------------------------------
eq('custom cake has no key', cakeSpecKey(cake({ tiersLabel: 'Custom (3 Steps)', tierDetails: [] })), null);
eq('wedding cake has no key', cakeSpecKey(cake({ occasion: 'Wedding' })), null);
eq('worker agrees: wedding cake has no key', B.cakeSpecKey(cake({ occasion: 'Wedding' })), null);
// An empty cake is "" (all parts null), not null: a key is only ever built
// from a validated cake, and "" stores as spec_key and matches nothing.
eq('empty cake is an empty key', cakeSpecKey({}), '');

// The written key must be one the order no longer exceeds the body limit
// with, and must survive bot.js's own catalogue key wrapper.
const key = B.cakeSpecKey(cake());
eq('order spec_key maps to a cake catalogue key', B.catalogueKeyFor({ order_type: 'Cake', spec_key: key }, {}), `cake:${key}`);
eq('wedding cake never maps to a catalogue key', B.catalogueKeyFor({ order_type: 'Cake', spec_key: null }, {}), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
