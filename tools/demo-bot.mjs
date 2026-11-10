/* Drives the R2.4 conversation locally and prints what the bot replied.

   Telegram itself is not involved: updates are POSTed to the real webhook
   route exactly as Telegram would post them, and with no TELEGRAM_BOT_TOKEN
   set the Worker prints each reply instead of sending it. So the transcript
   is produced by the same code path that would run in production, not by a
   mock of it.

   Run:  node tools/demo-bot.mjs   (with `wrangler dev --local` already up
                                     on the port below, and its log at LOG)
*/
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const PORT = process.env.DEMO_PORT || '8792';
// On Windows the MSYS /tmp is not Node's /tmp, so pass the real path:
//   DEMO_LOG="$(cygpath -w /tmp/wdev6.log)" node tools/demo-bot.mjs
const LOG = process.env.DEMO_LOG || '/tmp/wdev6.log';
const API = `http://127.0.0.1:${PORT}/api/tg/s3cret`;
const OWNER = '333';        // admin A: chat 333
const OPERATOR = '444';     // admin B: chat 444
const ORDER_CAKE = '20261110-120000111-DM';
const ORDER_CUSTOM = '20261110-120001222-DM';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Read only what appeared since the last call, so each step prints just the
// replies it caused. Tracked by byte offset rather than line count: wrangler
// rewrites parts of its log with carriage returns, so counting lines drifts
// and silently swallows output. A partial trailing line is held back until
// it is complete.
let offset = 0;
let pending = '';
function newLines() {
  let buf;
  try { buf = readFileSync(LOG); } catch { return []; }
  const text = buf.subarray(offset).toString('utf8');
  offset = buf.length;
  const lines = (pending + text).split('\n');
  pending = lines.pop();              // last piece may be half a line
  return lines
    .map(l => l.replace(/\x1b\[[0-9;]*m/g, ''))
    .map(l => {
      const skip = l.match(/telegram\(skip\) (\d+): (.*)$/);
      if (skip) return `  ${skip[1]} <- ${skip[2]}`;
      const note = l.match(/(bot: (?:duplicate|unauthorised).*)$/);
      return note ? `  [log] ${note[1]}` : null;
    })
    .filter(Boolean);
}

async function step(title, update) {
  console.log(`\n${title}`);
  await fetch(API, { method: 'POST', body: JSON.stringify(update) });
  await sleep(1500);
  for (const line of newLines()) console.log(line);
}

const msg = (chat, user, text, id) =>
  ({ update_id: id, message: { chat: { id: Number(chat) }, from: { id: Number(user) }, text } });
const press = (chat, user, data, id) =>
  ({ update_id: id, callback_query: { id: `cb${id}`, from: { id: Number(user) }, message: { chat: { id: Number(chat) }, message_id: id }, data } });

function d1(sql) {
  const out = execSync(
    `npx wrangler d1 execute la-creme-orders --local --command ${JSON.stringify(sql)} --json`,
    { cwd: 'worker', encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  );
  return JSON.parse(out)[0].results;
}

// Null when no confirmation is pending — that is itself a case worth
// demonstrating, so callers must cope with it rather than throw.
function quoteFor(chat, user) {
  const row = d1(`SELECT substr(payload, instr(payload, '"quote":"') + 9, 8) AS q FROM bot_state WHERE chat_id='${chat}' AND user_id='${user}'`)[0];
  return row && row.q ? row.q : null;
}

async function createOrder(o) {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/orders`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(o),
  });
  return res.status;
}

console.log('Seeding two orders...');
await createOrder({
  orderNumber: ORDER_CAKE, orderType: 'Cake', name: 'Ada Nwosu', phone: '08030000001',
  delivery: 'Pickup', items: 'Birthday cake, 2 Tiers, Vanilla',
  lines: [{ d: 'Birthday cake, 2 Tiers, Vanilla', q: 1, p: null }, { d: 'Delivery to Uyo', q: 1, p: 3000 }],
  specKey: '2 tiers|2 tiers|vanilla|buttercream', total: '',
});
await createOrder({
  orderNumber: ORDER_CUSTOM, orderType: 'Cake', name: 'Bola Eze', phone: '08030000002',
  delivery: 'Pickup', items: 'Wedding cake, custom',
  lines: [{ d: 'Wedding cake, custom 5 steps', q: 1, p: null }], total: '',
});
newLines();

let id = 9000;
const next = () => ++id;

// ---- The happy path, as an owner would do it ----
await step('OWNER: /edit-invoice', msg(OWNER, OWNER, '/edit-invoice', next()));
await step(`OWNER: ${ORDER_CAKE}`, msg(OWNER, OWNER, ORDER_CAKE, next()));
await step('OWNER: 1 = 45000  (proposes, does not save)', msg(OWNER, OWNER, '1 = 45000', next()));
console.log('  ...DB before the button press:',
  JSON.stringify(d1(`SELECT revised, price_status FROM orders WHERE order_number='${ORDER_CAKE}'`)[0]),
  '| versions:', d1(`SELECT COUNT(*) AS n FROM invoice_versions WHERE order_number='${ORDER_CAKE}'`)[0].n,
  '| product_prices:', d1('SELECT COUNT(*) AS n FROM product_prices')[0].n);

await step('OWNER: presses "Save price (also for future orders)"', press(OWNER, OWNER, `q:save:${quoteFor(OWNER, OWNER)}`, next()));
console.log('  ...DB after:', JSON.stringify(d1(`SELECT revised, price_status FROM orders WHERE order_number='${ORDER_CAKE}'`)[0]),
  '| versions:', JSON.stringify(d1(`SELECT version FROM invoice_versions WHERE order_number='${ORDER_CAKE}' ORDER BY version`).map(r => r.version)),
  '| catalogue:', d1('SELECT item_key, price FROM product_prices')[0] && JSON.stringify(d1('SELECT item_key, price FROM product_prices')[0]));

await step('OWNER: /approve ' + ORDER_CAKE, msg(OWNER, OWNER, '/approve ' + ORDER_CAKE, next()));
await step('OWNER: presses "Approve and send"', press(OWNER, OWNER, `q:approve:${quoteFor(OWNER, OWNER)}`, next()));

// ---- A custom cake: no catalogue button, and approval is refused while unpriced ----
await step('OPERATOR: /approve ' + ORDER_CUSTOM + '  (still unpriced)', msg(OPERATOR, OPERATOR, '/approve ' + ORDER_CUSTOM, next()));
await step(`OPERATOR: /edit-invoice ${ORDER_CUSTOM}`, msg(OPERATOR, OPERATOR, '/edit-invoice ' + ORDER_CUSTOM, next()));
await step('OPERATOR: 1 = 120000', msg(OPERATOR, OPERATOR, '1 = 120000', next()));
const opQuote = quoteFor(OPERATOR, OPERATOR);
const opUpdate = next();
await step('OPERATOR: presses "This order only"', press(OPERATOR, OPERATOR, `q:once:${opQuote}`, opUpdate));
console.log('  ...catalogue rows after "This order only":', d1('SELECT COUNT(*) AS n FROM product_prices')[0].n);

// ---- Delivery repeats and stale buttons ----
await step('Telegram re-delivers the same update_id', press(OPERATOR, OPERATOR, `q:once:${opQuote}`, opUpdate));
await step('Operator presses an already-used button', press(OPERATOR, OPERATOR, 'q:once:deadbeef', next()));

// ---- Two admins, one chat, separate sessions ----
// Both of these are sent from the SAME chat (333) by two different users, so
// the reply labels cannot tell them apart — hence the titles.
await step('OWNER (user 333, chat 333): /edit-invoice', msg(OWNER, OWNER, '/edit-invoice', next()));
await step('OPERATOR (user 444, same chat 333): /edit-invoice', msg(OWNER, OPERATOR, '/edit-invoice', next()));
await step('OPERATOR: names a different order', msg(OWNER, OPERATOR, ORDER_CUSTOM, next()));
console.log('  ...both sessions in chat 333:',
  JSON.stringify(d1(`SELECT user_id, step, order_no FROM bot_state WHERE chat_id='${OWNER}' ORDER BY user_id`)));

// ---- The 15-minute window ----
d1(`UPDATE bot_state SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','-20 minutes') WHERE user_id='${OWNER}'`);
await step('OWNER replies 20 minutes later', msg(OWNER, OWNER, '1 = 5', next()));

console.log('\nAudit trail:');
console.log(JSON.stringify(d1('SELECT at, actor_chat, actor_user, action, order_number, item_key, old_value, new_value FROM audit_log ORDER BY id'), null, 1));
