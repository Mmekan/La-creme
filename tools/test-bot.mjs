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
eq('command plain', B.parseCommand('/editinvoice'), { command: 'editinvoice', args: '' });
eq('command @suffix in groups', B.parseCommand('/approve@Mekabot 20261109-131600456-TB'),
  { command: 'approve', args: '20261109-131600456-TB' });
eq('command text is not a command', B.parseCommand('hello'), null);
eq('update command is one word', B.parseCommand('/updateprice afang:10L 62000'),
  { command: 'updateprice', args: 'afang:10L 62000' });

// --- price entry --------------------------------------------------------
eq('price plain', B.parsePriceEntry('2 = 4500'), { index: 2, price: 4500 });
eq('price with NGN and comma', B.parsePriceEntry('2=NGN 4,500'), { index: 2, price: 4500 });
eq('price with legacy naira glyph', B.parsePriceEntry('2=₦4,500'), { index: 2, price: 4500 });
eq('price clear', B.parsePriceEntry('2 = -'), { index: 2, price: null });
eq('bare number is not guessed at', !!B.parsePriceEntry('4500').error, true);
eq('line zero rejected', !!B.parsePriceEntry('0 = 5').error, true);
eq('over the ceiling rejected', !!B.parsePriceEntry('2 = 999999999').error, true);
eq('non-numeric rejected', !!B.parsePriceEntry('2 = abc').error, true);
eq('decimals round', B.parsePriceEntry('2 = 4500.4'), { index: 2, price: 4500 });

// --- formatting ---------------------------------------------------------
eq('money', B.money(1234567), 'NGN 1,234,567');
eq('order number normalises', B.parseOrderNumber(' 20261109-131600456-tb '), '20261109-131600456-TB');
eq('order number rejects junk', B.parseOrderNumber('hi'), null);
eq('line list', B.formatLines([{ d: 'Cake', q: 1, p: null }, { d: 'Puff Puff', q: 2, p: 1500 }]),
  '1. Cake - unpriced\n2. Puff Puff - NGN 3,000 (NGN 1,500 x 2)');

const card = B.formatPriceCard({
  orderNo: 'X-1', index: 0, line: { d: 'Cake', q: 1, p: null },
  oldP: null, newP: 4500, newTotal: 'NGN 7,500', unpriced: 0, catalogue: true,
});
eq('card shows current', card.includes('Current: unpriced'), true);
eq('card shows proposed', card.includes('Proposed: NGN 4,500'), true);
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

// --- R3.3 catalogue prices ---------------------------------------------
eq('update-price bare key + price', B.parseUpdatePrice('afang:10L 62000'), { itemKey: 'afang:10L', price: 62000 });
eq('update-price accepts the line-number syntax', B.parseUpdatePrice('afang:10L 1 = 62000'), { itemKey: 'afang:10L', price: 62000 });
eq('update-price accepts NGN and commas', B.parseUpdatePrice('afang:10L NGN 62,000'), { itemKey: 'afang:10L', price: 62000 });
eq('update-price keeps the key as typed (it is a lookup)', B.parseUpdatePrice('  afang:10L   62000 '), { itemKey: 'afang:10L', price: 62000 });
// A cake key contains spaces, so the first word is taken as the key and the
// rest as the price — it refuses rather than writing to the wrong row.
eq('update-price refuses a spaced cake key instead of guessing',
  B.parseUpdatePrice('cake:2 tiers, 3 tiers|vanilla 45000').error !== undefined, true);
eq('update-price needs a price', B.parseUpdatePrice('afang:10L').error !== undefined, true);
eq('update-price needs anything at all', B.parseUpdatePrice('').error !== undefined, true);
eq('update-price rejects clearing', B.parseUpdatePrice('afang:10L -').error !== undefined, true);
eq('update-price rejects a non-number price', B.parseUpdatePrice('afang:10L cheap').error !== undefined, true);
eq('update-price rejects zero', B.parseUpdatePrice('afang:10L 0').error !== undefined, true);
eq('update-price rejects over the ceiling', B.parseUpdatePrice(`afang:10L ${B.MAX_PRICE + 1}`).error !== undefined, true);

// The hint must name a command the owner can actually send: /prices takes an
// optional category now, and the old text pointed at a raw HTTP endpoint.
eq('the update-price hint points at /prices', /\/prices/.test(B.UPDATE_PRICE_HINT), true);
eq('and no longer at the API URL', /GET \/api\/prices/.test(B.UPDATE_PRICE_HINT), false);

// Owner gate is chat-id based, and an unset list means nobody.
const ownerEnv = { TELEGRAM_OWNER_CHAT_IDS: '-100123, 555' };
eq('owner chat allowed', B.isOwnerChat(ownerEnv, '-100123'), true);
eq('second owner chat allowed', B.isOwnerChat(ownerEnv, '555'), true);
eq('invoice-only chat refused', B.isOwnerChat({ TELEGRAM_INVOICE_CHAT_IDS: '999' }, '999'), false);
eq('no owner list refuses everyone', B.isOwnerChat({}, '-100123'), false);
eq('no env refuses everyone', B.isOwnerChat(undefined, '-100123'), false);

// --- daily report --------------------------------------------------------
// 23:00 UTC is 00:00 Lagos the next morning: the window must be the Lagos
// day that just ended, expressed back in UTC.
const w = B.lagosDayWindow(new Date('2026-11-19T23:00:00.000Z'));
eq('window starts at Lagos midnight', w.start, '2026-11-18T23:00:00.000Z');
eq('window ends at Lagos midnight', w.end, '2026-11-19T23:00:00.000Z');
eq('window labels the Lagos day', w.day, '2026-11-19');
const wEarly = B.lagosDayWindow(new Date('2026-11-19T22:59:00.000Z'));
eq('a run a minute early covers the same day', wEarly, w);

const row = (over = {}) => ({
  order_number: '20261119-120000101-TT', name: 'Ada', price_status: 'priced', total: 8000, ...over,
});
eq('empty day says so', B.dailyReportText([], w), 'Daily report - 2026-11-19\n\nNo orders today.');
eq('one priced order', B.dailyReportText([row()], w),
  'Daily report - 2026-11-19\n1 order, 1 priced\nRevenue: NGN 8,000\n\n20261119-120000101-TT - Ada - NGN 8,000');
eq('pending orders are not revenue', B.dailyReportText([row(), row({ order_number: 'X', price_status: 'pending', total: null })], w),
  'Daily report - 2026-11-19\n2 orders, 1 priced, 1 pending\nRevenue: NGN 8,000\n\n20261119-120000101-TT - Ada - NGN 8,000\nX - Ada - price pending');
const many = Array.from({ length: B.DAILY_REPORT_MAX_LINES + 2 }, (_, i) => row({ order_number: 'N' + i }));
eq('a long day is capped', B.dailyReportText(many, w).endsWith('+2 more'), true);

// --- dispatch: handleBotMessage through the real webhook path -------------
// Drives the Worker's default export with a signed /api/tg/<secret> POST,
// exactly as Telegram delivers it: secret in the path, work after the ack.
// sendChatMessage has no token here, so replies print instead of sending —
// capture the first line (console.log `telegram(skip) <chat> <first line>`)
// to assert on what the operator would have read.
const worker = (await import('../worker/index.js')).default;

// Real Telegram chat ids are 9-10 digits; STAFF_ID_RE demands 5-20, so the
// fixtures use realistic lengths throughout.
const OWNER = '555111222';
const REP = '777333444';
const STRANGER = '999444333';
const INVOICE = '888222111';
const makeTgEnv = (over = {}) => ({
  TELEGRAM_WEBHOOK_SECRET: 's3cret',
  TELEGRAM_OWNER_CHAT_IDS: OWNER,
  DB: {
    prepare: (sql) => ({
      bind: (...args) => ({
        all: async () => ({ results: over.staff || [] }),
        first: async () => (over.order && /FROM orders/.test(sql) ? over.order : null),
        run: async () => ({ meta: { changes: 1 } }),
      }),
      all: async () => ({ results: over.staff || [] }),
      first: async () => (over.order && /FROM orders/.test(sql) ? over.order : null),
      run: async () => ({ meta: { changes: over.changes == null ? 1 : over.changes } }),
    }),
    batch: async () => {},
  },
  ...over.extra,
});

const tgReplies = [];
const origLog = console.log;
const updateId = { n: 5000 };
async function sendTg(text, { chatId = OWNER, userId = OWNER, tgEnv } = {}) {
  const env = tgEnv || makeTgEnv();
  tgReplies.length = 0;
  console.log = (...a) => {
    const m = /^telegram\(skip\) (\S+) (.*)/.exec(String(a[0]));
    if (m) tgReplies.push({ chat: m[1], first: m[2] });
    else origLog(...a);
  };
  let res;
  try {
    const body = JSON.stringify({
      update_id: updateId.n++,
      message: { chat: { id: Number(chatId) }, from: { id: Number(userId) }, text },
    });
    const req = new Request('https://x/api/tg/s3cret', { method: 'POST', body });
    // The webhook acks first and works after it via ctx.waitUntil: collect
    // the detached promise and await it, or assertions race the reply.
    const pending = [];
    res = await worker.fetch(req, env, { waitUntil: (p) => { pending.push(p); return p; } });
    await Promise.all(pending);
  } finally {
    console.log = origLog;
  }
  return { status: res.status, replies: [...tgReplies] };
}
const firstLines = (r) => r.replies.map((x) => x.first);

// /editinvoice parks an 'order' conversation; the old spelling still works.
{
  const r = await sendTg('/editinvoice');
  eq('editinvoice asks for the order', firstLines(r), ['Which order? Send the order number, e.g. 20261109-131600456-TB.']);
}
{
  const r = await sendTg('/edit-invoice');
  eq('retired edit-invoice still asks for the order', firstLines(r), ['Which order? Send the order number, e.g. 20261109-131600456-TB.']);
}
// /updateprice with no args shows the catalogue prompt, not the help text.
{
  const tgEnv = makeTgEnv({ staff: [], extra: {} });
  const r = await sendTg('/updateprice', { tgEnv });
  eq('updateprice opens the catalogue flow', firstLines(r), ['The catalogue is empty. /updateprice adds the first price.']);
}
{
  const r = await sendTg('/update-price');
  eq('retired update-price opens the catalogue flow', firstLines(r), ['The catalogue is empty. /updateprice adds the first price.']);
}
// A stranger never reaches the command at all — the auth gate fires first.
{
  const tgEnv = makeTgEnv();
  const r = await sendTg('/updateprice afang:10L 62000', { chatId: STRANGER, userId: STRANGER, tgEnv });
  eq('stranger is refused before dispatch', firstLines(r), ['This bot is not authorised to discuss orders here.']);
}
// An authorised invoice-tier chat is refused the catalogue flow itself.
{
  const tgEnv = makeTgEnv({ staff: [], extra: { TELEGRAM_INVOICE_CHAT_IDS: INVOICE } });
  const r = await sendTg('/updateprice afang:10L 62000', { chatId: INVOICE, userId: INVOICE, tgEnv });
  eq('non-owner cannot updateprice', firstLines(r), ['Only the owner can change catalogue prices.']);
}

// --- join/approve identity guards ----------------------------------------
const staffEnv = (staff) => makeTgEnv({ staff: staff.map((s) => ({ chat_id: s[0], name: s[1] })) });
// Staff re-join: no new request goes to the owner.
{
  const tgEnv = staffEnv([[REP, 'Ada']]);
  const r = await sendTg('/join', { chatId: REP, userId: REP, tgEnv });
  eq('staff re-join is recognised', firstLines(r), ['You are already on the roster as Ada. Orders are sent to you here.']);
}
// Owner self-join: answered in place, nothing forwarded to themselves.
{
  const tgEnv = staffEnv([]);
  const r = await sendTg('/join Boss', { tgEnv });
  eq('owner self-join needs no approval', firstLines(r), ['You are the owner — no approval needed.']);
}
// Owner self-approve: rejected before touching the roster.
{
  const tgEnv = staffEnv([]);
  const r = await sendTg(`/approve ${OWNER} Boss`, { tgEnv });
  eq('owner cannot approve themselves', firstLines(r), [`That is your own chat id — you are already the owner. Give the rep's chat id instead: /approve <chat_id> <name>`]);
}
// Approving a second owner chat: rejected, they already get everything.
{
  const tgEnv = makeTgEnv({ staff: [], extra: { TELEGRAM_OWNER_CHAT_IDS: `${OWNER}, 556111222`, TELEGRAM_WEBHOOK_SECRET: 's3cret' } });
  const r = await sendTg('/approve 556111222 Rep', { tgEnv });
  eq('owner chat needs no roster spot', firstLines(r), ['556111222 is an owner chat — owners already get every order, no approval needed.']);
}
// Approving an enrolled rep again: named, not duplicated; rename path shown.
{
  const tgEnv = staffEnv([[REP, 'Ada']]);
  const r = await sendTg(`/approve ${REP} Ada`, { tgEnv });
  eq('double approve names the existing rep', firstLines(r), [`Ada (${REP}) is already on the roster. To rename them, run /approve ${REP} <new name>.`]);
}
// Approving a fresh rep still notifies the rep.
{
  const tgEnv = staffEnv([]);
  const r = await sendTg(`/approve ${REP} Ada`, { tgEnv });
  eq('fresh approve welcomes the rep', firstLines(r).includes('You have been added to the roster as Ada. Orders will be sent to you here.'), true);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
