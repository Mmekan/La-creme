/* Tests for config.js logOrder — the order-sending path shared by every page.

   The bug this guards: logOrder used sendBeacon whenever it was available.
   A beacon reports nothing back, so a caller that passed a callback (the
   challenge gate) never heard anything, and the gate sat on "Sending your
   order..." forever even though the order had been sent. The rule is now:
   a caller that wants an answer gets fetch, always.

   config.js is a plain browser script, not a module, so it is evaluated in a
   stubbed global scope rather than imported. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; } else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

const source = readFileSync(new URL('../config.js', import.meta.url), 'utf8');

// Builds a fresh sandbox per case so one case's calls cannot leak into another.
function load({ beacon = true, status = 200 } = {}) {
  const calls = { beacon: 0, fetch: 0, bodies: [], headers: [] };
  const sandbox = {
    console,
    setTimeout, clearTimeout,
    Blob: class { constructor(parts) { this.parts = parts; } },
    crypto: { randomUUID: () => 'device-abc' },
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: {},
    fetch: async (url, init) => {
      calls.fetch++;
      calls.bodies.push(init.body);
      calls.headers.push(init.headers);
      return { ok: status >= 200 && status < 300, status };
    },
    // config.js touches the DOM at load time (it fills in the contact number),
    // so every lookup has to return something rather than undefined.
    document: {
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => ({ textContent: '', href: '', style: {}, setAttribute() {}, appendChild() {} }),
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }),
      head: { appendChild() {} },
      body: { appendChild() {} },
      documentElement: { style: {} },
    },
    window: { addEventListener() {} },
  };
  if (beacon) sandbox.navigator.sendBeacon = (url, blob) => {
    calls.beacon++;
    calls.bodies.push(blob.parts[0]);
    return true;
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { sandbox, calls };
}

// 1. No callback: the beacon is the cheapest path and is used.
{
  const { sandbox, calls } = load();
  sandbox.logOrder({ orderNumber: 'A-1' });
  eq('no callback uses sendBeacon', calls.beacon, 1);
  eq('no callback skips fetch', calls.fetch, 0);
}

// 2. A callback means the caller needs the status, so fetch must be used.
{
  const { sandbox, calls } = load();
  let seen = null;
  sandbox.logOrder({ orderNumber: 'A-2' }, (err, info) => { seen = { err: !!err, info }; });
  await new Promise(r => setTimeout(r, 10));
  eq('a callback skips sendBeacon', calls.beacon, 0);
  eq('a callback uses fetch', calls.fetch, 1);
  eq('a successful send reports no error', seen, { err: false, info: { status: 200 } });
}

// 3. A 429 must reach the caller as limited, which is what opens the gate.
{
  const { sandbox, calls } = load({ status: 429 });
  let seen = null;
  sandbox.logOrder({ orderNumber: 'A-3' }, (err, info) => { seen = { err: !!err, limited: info.limited }; });
  await new Promise(r => setTimeout(r, 10));
  eq('a 429 reports limited', seen, { err: true, limited: true });
  eq('a 429 still went through fetch', calls.fetch, 1);
}

// 4. The device id rides in the body, because a beacon cannot set headers.
{
  const { sandbox, calls } = load();
  sandbox.logOrder({ orderNumber: 'A-4' });
  const sent = JSON.parse(calls.bodies[0]);
  eq('the body carries the device id', sent.deviceId, 'device-abc');
  eq('the order number survives', sent.orderNumber, 'A-4');
}

// 5. No header is set for the device id any more.
{
  const { sandbox, calls } = load();
  sandbox.logOrder({ orderNumber: 'A-5' }, () => {});
  await new Promise(r => setTimeout(r, 10));
  eq('no X-Device-Id header is sent', (calls.headers[0] || {})['X-Device-Id'], undefined);
}

// 6. A disabled API sends nothing at all.
{
  const { sandbox, calls } = load();
  // CONFIG is a top-level const, so it is not a property of the sandbox
  // object; it has to be changed from inside the context.
  vm.runInContext("CONFIG.ordersApi = '';", sandbox);
  sandbox.logOrder({ orderNumber: 'A-6' }, () => {});
  await new Promise(r => setTimeout(r, 10));
  eq('a disabled API sends no beacon', calls.beacon, 0);
  eq('a disabled API sends no fetch', calls.fetch, 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
