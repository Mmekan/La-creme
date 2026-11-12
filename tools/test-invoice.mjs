/* Unit tests for worker/invoice.js — the settings guard (P-3).

   No database, no network: loadSettings is exercised against a fake D1
   binding, and the PDF is grepped as text because its content streams are
   deliberately uncompressed.

   Run:  node tools/test-invoice.mjs
*/
import * as I from '../worker/invoice.js';
import { allowPlaceholderSettings } from '../worker/index.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};
const ok = (name, cond) => eq(name, !!cond, true);

const pdfText = (bytes) => new TextDecoder('latin1').decode(bytes);

// --- resolveSettings: placeholders never reach a page -------------------
const r0 = I.resolveSettings({});
eq('defaults blank the phone', r0.settings.company_phone, '');
eq('defaults blank the address', r0.settings.company_address, '');
eq('defaults blank the bank', r0.settings.bank_name, '');
eq('defaults blank the account number', r0.settings.account_number, '');
eq('defaults keep the company name', r0.settings.company_name, "La'Creme Confectionery");
eq('defaults keep the account name', r0.settings.account_name, "La'Creme Confectionery");
eq('missing names all four placeholders', r0.missing.slice().sort(),
  ['account_number', 'bank_name', 'company_address', 'company_phone']);

const r1 = I.resolveSettings({ bank_name: 'GTBank', account_number: '0123456789' });
eq('a real bank name is kept', r1.settings.bank_name, 'GTBank');
eq('a placeholder account number is still blanked', r1.settings.account_number, '');
eq('a supplied bank is not reported missing', r1.missing.includes('bank_name'), false);

const r2 = I.resolveSettings({}, true);
eq('allowPlaceholders keeps the demo bank', r2.settings.bank_name, 'Demo Bank');
eq('allowPlaceholders reports nothing missing', r2.missing, []);

// --- loadSettings: D1 read, never throws --------------------------------
const fakeEnv = (rows) => ({
  DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) },
});
const loaded = await I.loadSettings(fakeEnv([
  { key: 'bank_name', value: 'GTBank' },
  { key: 'tg_update:1', value: 'x' },
  { key: 'company_phone', value: 123 },
]));
eq('loadSettings keeps a known string key', loaded.bank_name, 'GTBank');
eq('loadSettings drops an unknown key', 'tg_update:1' in loaded, false);
eq('loadSettings drops a non-string value', 'company_phone' in loaded, false);
eq('loadSettings without a DB is empty', await I.loadSettings({}), {});

const origErr = console.error;
console.error = () => {};
const threw = await I.loadSettings({ DB: { prepare: () => { throw new Error('boom'); } } });
console.error = origErr;
eq('loadSettings never throws', threw, {});

// --- renderInvoice: the stamp travels with the document -----------------
const order = {
  order_number: 'X-1',
  received_at: '2026-11-11T00:00:00Z',
  name: 'Ada',
  lines_json: JSON.stringify([{ d: 'Cake', q: 1, p: null }]),
};

const unconfigured = pdfText(I.renderInvoice(order));
ok('unconfigured invoice carries the stamp', unconfigured.includes('BUSINESS DETAILS NOT CONFIGURED'));
ok('unconfigured invoice prints no demo bank', !unconfigured.includes('Demo Bank'));
ok('unconfigured invoice prints no demo account', !unconfigured.includes('0123456789'));
ok('unconfigured invoice prints no placeholder phone', !unconfigured.includes('+234 800 000 0000'));
ok('unconfigured invoice prints no placeholder address', !unconfigured.includes('Placeholder Road'));

const configured = pdfText(I.renderInvoice({
  ...order,
  settings: {
    company_phone: '08066835713',
    company_address: 'Uyo, Akwa Ibom',
    bank_name: 'GTBank',
    account_name: "La'Creme Confectionery",
    account_number: '1234567890',
  },
}));
ok('configured invoice prints the real bank', configured.includes('GTBank'));
ok('configured invoice prints the real account', configured.includes('1234567890'));
ok('configured invoice carries no stamp', !configured.includes('BUSINESS DETAILS NOT CONFIGURED'));

const allowed = pdfText(I.renderInvoice({ ...order, allowPlaceholders: true }));
ok('allowPlaceholders prints the demo bank', allowed.includes('Demo Bank'));
ok('allowPlaceholders prints no stamp', !allowed.includes('BUSINESS DETAILS NOT CONFIGURED'));

// --- the escape hatch is development-only -------------------------------
eq('placeholders off in production even with the flag',
  allowPlaceholderSettings({ ENVIRONMENT: 'production', ALLOW_PLACEHOLDER_SETTINGS: 'true' }), false);
eq('placeholders off when ENVIRONMENT is unset',
  allowPlaceholderSettings({ ALLOW_PLACEHOLDER_SETTINGS: 'true' }), false);
eq('placeholders off in development without the flag',
  allowPlaceholderSettings({ ENVIRONMENT: 'development' }), false);
eq('placeholders on in development with the flag',
  allowPlaceholderSettings({ ENVIRONMENT: 'development', ALLOW_PLACEHOLDER_SETTINGS: 'true' }), true);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
