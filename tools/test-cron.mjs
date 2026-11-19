/* Both cron schedules, each run on its own against a stubbed env.

   The retention sweep and the daily report share one scheduled handler and
   one cron list, so the risk is one schedule quietly running the other's
   work. Each case asserts what its schedule did and did not touch.

   Run: node tools/test-cron.mjs
*/
const { runScheduled } = await import('../worker/index.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.log(`FAIL ${name}\n got ${JSON.stringify(got)}\n want ${JSON.stringify(want)}`); }
};

const sent = [];
globalThis.fetch = async (url, init) => {
  if (String(url).includes('/sendMessage')) sent.push(JSON.parse(init.body));
  return { ok: true, json: async () => ({ ok: true }) };
};

const makeEnv = () => {
  const calls = [];
  const prepare = (sql) => ({
    bind: () => ({
      all: async () => { calls.push(sql); return { results: [] }; },
      first: async () => null,
      run: async () => ({ meta: { changes: 0 } }),
    }),
    all: async () => { calls.push(sql); return { results: [] }; },
    first: async () => null,
    run: async () => ({ meta: { changes: 0 } }),
  });
  return {
    calls,
    env: { DB: { prepare }, TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '555' },
    ctx: {},
  };
};

// --- 23:00 UTC: the daily report ----------------------------------------
{
  sent.length = 0;
  const { env, calls, ctx } = makeEnv();
  await runScheduled({ cron: '0 23 * * *' }, env, ctx);
  eq('report: exactly one message', sent.length, 1);
  eq('report: goes to TELEGRAM_CHAT_ID', sent[0].chat_id, '555');
  eq('report: opens with the day', /^Daily report - \d{4}-\d{2}-\d{2}\n\n/.test(sent[0].text), true);
  eq('report: empty day is stated', /No orders today\.$/.test(sent[0].text), true);
  eq('report: reads the day window', calls.some((s) => /FROM orders o/.test(s)), true);
  eq('report: never touches uploads', calls.some((s) => /upload_items|upload_batches/.test(s)), false);
}

// --- 03:23 UTC: the retention sweep --------------------------------------
{
  sent.length = 0;
  const { env, calls, ctx } = makeEnv();
  await runScheduled({ cron: '23 3 * * *' }, env, ctx);
  eq('sweep: no message sent', sent.length, 0);
  eq('sweep: reads upload_items', calls.some((s) => /FROM upload_items/.test(s)), true);
  eq('sweep: never reads orders', calls.some((s) => /FROM orders o/.test(s)), false);
}

// --- an unknown cron must still sweep, never report ----------------------
{
  sent.length = 0;
  const { env, calls, ctx } = makeEnv();
  await runScheduled({ cron: '*/5 * * * *' }, env, ctx);
  eq('unknown cron: no message sent', sent.length, 0);
  eq('unknown cron: sweeps', calls.some((s) => /FROM upload_items/.test(s)), true);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
