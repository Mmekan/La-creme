/* ============================================================
   LA CRÈME — ORDER API (Cloudflare Worker + D1)

   Public:   POST /api/orders          the website logs an order here
   Private:  POST /api/login           password -> 12h session token
             GET  /api/orders          list/search orders
             PATCH /api/orders/:no     update an order's status

   Secrets (wrangler secret put): ADMIN_PASSWORD, SESSION_SECRET
============================================================ */

import { parseInvoiceChatIds, serializeLines, parseStoredLines, summariseLines, renderInvoice } from './invoice.js';
import {
  money, parseCommand, parseOrderNumber, parsePriceEntry, formatLines,
  formatPriceCard, formatApproveCard, newQuoteId, callbackData, parseCallbackData,
  catalogueKeyFor, catalogueLabel,
} from './bot.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 30 * 1024;
const MAX_FAILED_LOGINS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const STATUSES = ['New', 'Confirmed', 'In Progress', 'Ready', 'Delivered', 'Cancelled'];
const ORDER_NO_RE = /^\d{8}-\d{9}-[A-Z]{1,3}$/;

/* ---------- media upload pipeline ----------
   Spec: docs/superpowers/specs/2026-10-05-media-upload-pipeline-design.md
------------------------------------------------ */

// Mirror of MEDIA_CATEGORIES in config.js. The Worker cannot import
// config.js — that file calls document.getElementById at load, which
// throws outside a browser. Keep the two lists identical; Task 1's
// config.js carries the matching cross-reference comment, and Step 4
// below verifies the server rejects a category the client doesn't offer.
const MEDIA_CATEGORIES = [
  'Traditional Wedding Cakes',
  'Anniversary',
  'Cakes for Boys',
  'Cakes for Girls',
  'Cakes for Men',
  'Cakes for Women',
  'Wedding Cakes',
  'Catering & Events',
  'Small Chops',
];

const R2_BASE_URL = 'https://pub-a9f72716b1e94d4bb55753e389d9903d.r2.dev';
const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;            // spec 6.4 body cap
const UPLOAD_MAX_BATCH = 200;                        // spec 6.4 batch cap
const RATE_WINDOW_MS = 60 * 60 * 1000;               // 1 hour
const RATE_MAX_PER_WINDOW = 30;                      // spec 6.4: 30 files/hour
const RATE_DAY_MS = 24 * 60 * 60 * 1000;
const RATE_MAX_HOURS_PER_DAY = 20;                   // spec 6.4: 20 distinct hours/day

// 'Catering & Events' -> 'catering-and-events'. Keys are our own, so
// anything non-slug-safe just gets dropped rather than escaped.
function slugifyCategory(cat) {
  return String(cat).toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Returns true if this IP has exhausted its allowance. Inserts a
// timestamped row when allowed, so the *next* call sees it.
async function uploadRateLimited(ip, env) {
  const now = Date.now();
  await env.DB.prepare('DELETE FROM upload_rate WHERE ts < ?').bind(now - RATE_DAY_MS).run();

  const hour = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM upload_rate WHERE ip = ? AND ts > ?'
  ).bind(ip, now - RATE_WINDOW_MS).all();
  if (hour.results[0].n >= RATE_MAX_PER_WINDOW) return true;

  // ts / 3600000 is integer division in SQLite, so this counts distinct
  // hour-buckets rather than hours — matches "20 distinct hours per day".
  const day = await env.DB.prepare(
    'SELECT COUNT(DISTINCT (ts / 3600000)) AS n FROM upload_rate WHERE ip = ? AND ts > ?'
  ).bind(ip, now - RATE_DAY_MS).all();
  if (day.results[0].n >= RATE_MAX_HOURS_PER_DAY) return true;

  await env.DB.prepare('INSERT INTO upload_rate (ip, ts) VALUES (?, ?)').bind(ip, now).run();
  return false;
}

// Creates the batch row on the file's first arrival, otherwise returns
// the existing one. Separate from the insert so handleUpload stays flat.
async function ensureBatch(env, clientBatchId, category, declaredTotal, nowIso) {
  const existing = await env.DB.prepare(
    'SELECT * FROM upload_batches WHERE client_batch_id = ?'
  ).bind(clientBatchId).first();
  if (existing) return existing;

  await env.DB.prepare(
    `INSERT INTO upload_batches
       (client_batch_id, received_at, category, file_count, status)
     VALUES (?, ?, ?, ?, 'Pending')`
  ).bind(clientBatchId, nowIso, category, declaredTotal).run();
  return await env.DB.prepare(
    'SELECT * FROM upload_batches WHERE client_batch_id = ?'
  ).bind(clientBatchId).first();
}

// Folds one file's outcome into its batch. Every expression in the SET
// clause reads the row's pre-update values, which is what makes the
// status CASE work: failed_count inside the CASE is the count *before*
// this file, so `failed_count + <failedDelta> > 0` correctly catches the
// case where this very file is the first failure.
async function bumpBatch(env, batch, storedDelta, failedDelta, bytes) {
  await env.DB.prepare(
    `UPDATE upload_batches
        SET stored_count = stored_count + ?,
            failed_count = failed_count + ?,
            total_bytes  = total_bytes + ?,
            status = CASE
              WHEN stored_count + failed_count + ? + ? >= file_count THEN
                CASE WHEN failed_count + ? > 0 THEN 'Partial' ELSE 'Complete' END
              ELSE 'Pending'
            END
      WHERE id = ?`
  ).bind(storedDelta, failedDelta, bytes, storedDelta, failedDelta, failedDelta, batch.id).run();
}

// Fire-and-forget. Never throws: a Telegram outage must not fail an
// upload (spec 8). Callers hand the returned promise to ctx.waitUntil()
// rather than awaiting it, so the upload responds without waiting on
// Telegram but Cloudflare still keeps the Worker alive until it lands.
async function sendTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  await sendChatMessage(env, env.TELEGRAM_CHAT_ID, text);
}

// Same fire-and-forget contract as sendTelegram, but addressed to one chat:
// the invoice list, the owner list and a bot reply all name their target.
// `buttons` is a reply_markup.inline_keyboard array — rows of
// { text, callback_data } — and is what makes a price change need a press
// rather than a typed number.
async function sendChatMessage(env, chatId, text, buttons) {
  if (!chatId) return;
  if (!env.TELEGRAM_BOT_TOKEN) {
    // With no token nothing can ever be delivered — which is exactly the
    // local dev case. Print the first line so a conversation driven by
    // curl reads like a conversation, and stay silent about the rest: the
    // full text is in D1 and in the audit trail.
    console.log(`telegram(skip) ${chatId}: ${String(text).split('\n')[0]}`);
    return;
  }
  try {
    // No parse_mode on purpose: descriptions come from the site and any
    // stray * or _ would make Telegram reject the whole message.
    const body = { chat_id: chatId, text: String(text).slice(0, 4000) };
    if (buttons && buttons.length) body.reply_markup = { inline_keyboard: buttons };
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error('telegram:', res.status, await res.text());
  } catch (err) {
    console.error('telegram:', err && err.name ? err.name : 'error');
  }
}

// Tells Telegram the button press was received, so the client stops its
// spinner. Purely cosmetic, so a failure is ignored.
async function answerCallback(env, callbackId) {
  if (!env.TELEGRAM_BOT_TOKEN || !callbackId) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId }),
    });
  } catch (err) { /* the spinner timing out is harmless */ }
}

// Fire-and-forget, like sendTelegram: an invoice that fails to send must
// never fail the order. The caption carries the order summary, so the rep
// sees what it is without opening the file — one Telegram call per
// recipient instead of two.
async function sendDocument(env, chatId, bytes, filename, caption) {
  if (!chatId) return;
  if (!env.TELEGRAM_BOT_TOKEN) {
    // Same reasoning as sendChatMessage: local runs have no token, and a
    // silently dropped document makes a demo read as though nothing was
    // sent. Say what would have gone out, and how big it was.
    console.log(`telegram(skip) ${chatId}: [document] ${filename} (${bytes.length} bytes)`);
    return;
  }
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    if (caption) form.append('caption', caption);
    form.append('document', new Blob([bytes], { type: 'application/pdf' }), filename);
    // No Content-Type header: the runtime sets the multipart boundary.
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: 'POST', body: form,
    });
    if (!res.ok) console.error('telegram document:', res.status, await res.text());
  } catch (err) {
    console.error('telegram document:', err && err.name ? err.name : 'error');
  }
}

// Spec §7.1a: invoices go to TELEGRAM_INVOICE_CHAT_IDS — never to the
// upload-alert chat. The owner's own chats are added too, since the owner
// reviews pending prices; the two lists are usually overlapping (the owner
// IS the operator), hence the dedupe: one PDF per chat, not one per list.
// No fallback: if both secrets are unset the invoice is simply not
// delivered, and the log says why.
function invoiceRecipients(env) {
  return [...new Set([
    ...parseInvoiceChatIds(env.TELEGRAM_INVOICE_CHAT_IDS),
    ...parseInvoiceChatIds(env.TELEGRAM_OWNER_CHAT_IDS),
  ])].slice(0, 20);
}

function sendInvoiceToCompany(env, order, caption) {
  const ids = invoiceRecipients(env);
  if (!ids.length) {
    console.error('invoice: neither TELEGRAM_INVOICE_CHAT_IDS nor TELEGRAM_OWNER_CHAT_IDS is set');
    return Promise.resolve();
  }
  const bytes = renderInvoice(order);
  const filename = `LaCreme-Invoice-${order.order_number}.pdf`;
  return Promise.all(ids.map(id => sendDocument(env, id, bytes, filename, caption)));
}

/* ---------- Telegram webhook (R2.3, spec §8) ---------- */

// Telegram re-delivers an update until it receives a 2xx, so the reply has
// to be immediate and the work has to happen after it: ctx.waitUntil keeps
// the invocation alive without holding the response open. The update_id is
// what makes a re-delivery harmless — it is claimed before any work starts,
// so a duplicate can never produce a second revision.
const TG_DEDUPE_PREFIX = 'tg_update:';
const TG_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

// Dedupe lives in `settings` rather than its own table: it is one row per
// update and D1 has no row expiry, so the arrival time doubles as the TTL
// record. Telegram's retry window is minutes, so a day is generous. A sweep
// failure is logged and ignored — it must never cost us an update.
async function claimUpdate(env, updateId) {
  const key = TG_DEDUPE_PREFIX + String(updateId);
  const res = await env.DB.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  ).bind(key, new Date().toISOString()).run();
  const fresh = !!(res.meta && res.meta.changes);
  if (fresh) {
    try {
      await env.DB.prepare(
        "DELETE FROM settings WHERE key LIKE 'tg_update:%' AND value < ?"
      ).bind(new Date(Date.now() - TG_DEDUPE_TTL_MS).toISOString()).run();
    } catch (err) {
      console.error('bot: dedupe sweep:', err && err.name ? err.name : 'error');
    }
  }
  return fresh;
}

// A 404 with no detail, for a wrong path and a wrong secret alike: the two
// must be indistinguishable, or the path becomes an oracle for guessing the
// secret (spec §8).
const webhookMiss = () => new Response('Not found', { status: 404 });

async function handleTelegramWebhook(request, env, ctx, provided) {
  // No secret configured means no webhook. Accepting the path anyway would
  // leave an unauthenticated write endpoint on the Worker.
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    console.error('bot: TELEGRAM_WEBHOOK_SECRET is not set');
    return webhookMiss();
  }
  if (!(await safeEqual(env.TELEGRAM_WEBHOOK_SECRET, provided, env.TELEGRAM_WEBHOOK_SECRET))) {
    return webhookMiss();
  }

  // Read the body here, while the request is still live, then let the work
  // run detached: a slow D1 round-trip must not delay the ack.
  let raw;
  try { raw = await request.text(); } catch (err) { raw = ''; }
  ctx.waitUntil(processTelegramUpdate(env, raw));
  return new Response('OK', { status: 200 });
}

async function processTelegramUpdate(env, raw) {
  let update;
  try { update = JSON.parse(raw); } catch (err) { return; }  // not ours to interpret
  if (!update || update.update_id == null) return;

  try {
    if (!(await claimUpdate(env, update.update_id))) {
      console.log(`bot: duplicate update ${update.update_id} ignored`);
      return;
    }
    // A button press and a typed line are the same conversation, just
    // delivered in different fields.
    const cb = update.callback_query;
    const msg = update.message || update.edited_message;
    const from = cb ? cb.from : msg && msg.from;
    const chat = cb ? cb.message && cb.message.chat : msg && msg.chat;
    if (!chat || chat.id == null) return;   // service messages, channel posts

    const chatId = String(chat.id);
    const userId = String(from && from.id != null ? from.id : chatId);

    // Authorise by chat id, not by who sent it: only the invoice and owner
    // lists may see order data, and anyone else gets one line with none.
    if (!invoiceRecipients(env).includes(chatId)) {
      console.error(`bot: unauthorised chat ${chatId}`);
      await sendChatMessage(env, chatId, 'This bot is not authorised to discuss orders here.');
      return;
    }

    if (cb) {
      await answerCallback(env, cb.id);
      await handleBotCallback(env, chatId, userId, String(cb.data || ''));
      return;
    }
    if (!msg) return;
    await handleBotMessage(env, chatId, userId, String(msg.text || ''));
  } catch (err) {
    console.error('bot:', err && err.name ? err.name : 'error');
  }
}

/* ---------- bot conversation (R2.4, spec §8) ---------- */

// A conversation nobody finished should not sit there forever. Fifteen
// minutes is long enough to find an order number and short enough that a
// stale step never surprises the next person.
const BOT_STATE_TTL_MS = 15 * 60 * 1000;

// State is per (chat, user): two admins working in the same group chat each
// get their own step, so one cannot move the other's conversation along.
async function getBotState(env, chatId, userId) {
  const row = await env.DB.prepare(
    'SELECT * FROM bot_state WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, userId).first();
  if (!row) return null;
  if (Date.now() - Date.parse(row.updated_at) > BOT_STATE_TTL_MS) {
    await clearBotState(env, chatId, userId);
    return { expired: true };
  }
  return row;
}

async function setBotState(env, chatId, userId, step, orderNo, payload) {
  await env.DB.prepare(
    `INSERT INTO bot_state (chat_id, user_id, step, order_no, payload, updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET
       step = excluded.step,
       order_no = excluded.order_no,
       payload = excluded.payload,
       updated_at = excluded.updated_at`
  ).bind(
    chatId, userId, step, orderNo || null,
    payload ? JSON.stringify(payload) : null, new Date().toISOString()
  ).run();
}

async function clearBotState(env, chatId, userId) {
  await env.DB.prepare('DELETE FROM bot_state WHERE chat_id = ? AND user_id = ?')
    .bind(chatId, userId).run();
}

// Every price change, revision and approval is recorded with the human who
// made it. Written inside the same D1 batch as the change itself, so a
// change without its audit row cannot commit.
function auditStatement(env, entry) {
  return env.DB.prepare(
    `INSERT INTO audit_log
       (at, actor_chat, actor_user, action, order_number, item_key, old_value, new_value, detail)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(
    new Date().toISOString(), entry.chatId || null, entry.userId || null, entry.action,
    entry.orderNumber || null, entry.itemKey || null,
    entry.oldValue == null ? null : String(entry.oldValue),
    entry.newValue == null ? null : String(entry.newValue),
    entry.detail ? JSON.stringify(entry.detail) : null
  );
}

const HELP_TEXT = [
  'Commands:',
  '/edit-invoice - set a price on an order',
  '/approve - mark a priced invoice final',
  '/cancel - abandon what you were doing',
].join('\n');

async function loadOrder(env, orderNumber) {
  return env.DB.prepare('SELECT * FROM orders WHERE order_number = ?').bind(orderNumber).first();
}

// Shows the order's lines and parks the conversation in the 'edit' step.
async function showOrderForEdit(env, chatId, userId, orderNumber) {
  const order = await loadOrder(env, orderNumber);
  if (!order) {
    await clearBotState(env, chatId, userId);
    return sendChatMessage(env, chatId, `No order ${orderNumber}. Send /edit-invoice to try another.`);
  }
  const lines = parseStoredLines(order);
  const { unpriced } = summariseLines(lines);
  const note = order.price_status === 'approved'
    ? '\n\nThis invoice is approved. Changing a price bumps the version and it must be approved again.'
    : '';
  await setBotState(env, chatId, userId, 'edit', order.order_number, null);
  return sendChatMessage(env, chatId, [
    `Order ${order.order_number} - ${order.name || 'no name'}`,
    `${order.price_status}${unpriced ? `, ${unpriced} unpriced` : ''}`,
    '',
    formatLines(lines),
    '',
    'Reply with the line and its price, e.g. 2 = 4500, or 2 = - to mark it unpriced.',
  ].join('\n') + note);
}

async function handleBotMessage(env, chatId, userId, text) {
  const cmd = parseCommand(text);

  if (cmd) {
    if (cmd.command === 'cancel') {
      await clearBotState(env, chatId, userId);
      return sendChatMessage(env, chatId, 'Cancelled. Nothing was changed.');
    }
    if (cmd.command === 'edit-invoice') {
      const no = cmd.args ? parseOrderNumber(cmd.args) : null;
      if (cmd.args && !no) return sendChatMessage(env, chatId, 'That does not look like an order number.');
      if (no) return showOrderForEdit(env, chatId, userId, no);
      await setBotState(env, chatId, userId, 'order', null, null);
      return sendChatMessage(env, chatId, 'Which order? Send the order number, e.g. 20261109-131600456-TB.');
    }
    if (cmd.command === 'approve') {
      const no = cmd.args ? parseOrderNumber(cmd.args) : null;
      if (cmd.args && !no) return sendChatMessage(env, chatId, 'That does not look like an order number.');
      if (no) return startApprove(env, chatId, userId, no);
      await setBotState(env, chatId, userId, 'approve', null, null);
      return sendChatMessage(env, chatId, 'Which order? Send the order number to approve it.');
    }
    if (cmd.command === 'update-price') {
      // Owner-only, and R3.3. Saying so is better than silence.
      return sendChatMessage(env, chatId, 'Catalogue prices (/update-price) arrive with R3 and are not live yet.');
    }
    return sendChatMessage(env, chatId, HELP_TEXT);
  }

  const state = await getBotState(env, chatId, userId);
  if (state && state.expired) {
    return sendChatMessage(env, chatId, 'That request timed out after 15 minutes. Send /edit-invoice to start again.');
  }
  if (!state) return sendChatMessage(env, chatId, HELP_TEXT);

  if (state.step === 'order' || state.step === 'approve') {
    const no = parseOrderNumber(text);
    if (!no) return sendChatMessage(env, chatId, 'Send the order number, e.g. 20261109-131600456-TB.');
    return state.step === 'order'
      ? showOrderForEdit(env, chatId, userId, no)
      : startApprove(env, chatId, userId, no);
  }

  if (state.step === 'edit') {
    return proposePrice(env, chatId, userId, state, text);
  }

  if (state.step === 'confirm') {
    return sendChatMessage(env, chatId, 'Press one of the buttons on the confirmation above, or send /cancel.');
  }
  return sendChatMessage(env, chatId, HELP_TEXT);
}

// Turns "2 = 4500" into a confirmation card. Nothing is written here — that
// is the whole point of the extra step.
async function proposePrice(env, chatId, userId, state, text) {
  const parsed = parsePriceEntry(text);
  if (parsed.error) return sendChatMessage(env, chatId, parsed.error);

  const order = await loadOrder(env, state.order_no);
  if (!order) {
    await clearBotState(env, chatId, userId);
    return sendChatMessage(env, chatId, `No order ${state.order_no}.`);
  }
  const lines = parseStoredLines(order);
  const index = parsed.index - 1;
  if (index < 0 || index >= lines.length) {
    return sendChatMessage(env, chatId, `There is no line ${parsed.index}. This order has ${lines.length}.`);
  }

  const line = lines[index];
  if (line.p === parsed.price) {
    return sendChatMessage(env, chatId, `Line ${parsed.index} is already ${parsed.price === null ? 'unpriced' : money(parsed.price)}. Nothing to change.`);
  }

  // Preview the total the same way the write will compute it: swap the
  // line, then let the one shared helper decide what the order is worth.
  const preview = lines.map((l, i) => (i === index ? { ...l, p: parsed.price } : l));
  const summary = summariseLines(preview);

  const key = catalogueKeyFor(order, line);
  const quote = newQuoteId();
  await setBotState(env, chatId, userId, 'confirm', order.order_number, {
    kind: 'price', quote, index, oldP: line.p, newP: parsed.price, catalogueKey: key,
    wasApproved: order.price_status === 'approved',
  });

  const buttons = [];
  // Only a line with a catalogue key gets the "remember it everywhere"
  // option: a custom or wedding cake has none, so its quote can never
  // become the standing price for that spec.
  if (key && parsed.price !== null) {
    buttons.push({ text: 'Save price (also for future orders)', callback_data: callbackData('save', quote) });
  }
  buttons.push({ text: 'This order only', callback_data: callbackData('once', quote) });
  buttons.push({ text: 'Cancel', callback_data: callbackData('cancel', quote) });

  return sendChatMessage(env, chatId, formatPriceCard({
    orderNo: order.order_number, index, line,
    oldP: line.p, newP: parsed.price,
    newTotal: summary.unpriced === lines.length ? 'price on request' : money(summary.total),
    unpriced: summary.unpriced,
    catalogue: !!key,
  }), [buttons]);
}

async function startApprove(env, chatId, userId, orderNumber) {
  const order = await loadOrder(env, orderNumber);
  if (!order) {
    await clearBotState(env, chatId, userId);
    return sendChatMessage(env, chatId, `No order ${orderNumber}.`);
  }
  if (order.price_status === 'approved') {
    await clearBotState(env, chatId, userId);
    return sendChatMessage(env, chatId, `Order ${order.order_number} is already approved.`);
  }

  const lines = parseStoredLines(order);
  const summary = summariseLines(lines);
  // Recounted from the lines themselves, not trusted from price_status:
  // an invoice must never go out final while a line is still unpriced.
  const unpriced = lines.map((l, i) => (l.p === null ? i + 1 : null)).filter(Boolean);

  if (unpriced.length) {
    await clearBotState(env, chatId, userId);
    await auditStatement(env, {
      chatId, userId, action: 'approve-refused', orderNumber: order.order_number,
      detail: { reason: 'unpriced-lines', lines: unpriced },
    }).run().catch(err => console.error('audit:', err && err.name ? err.name : 'error'));
    return sendChatMessage(env, chatId, formatApproveCard({
      orderNo: order.order_number, total: 'price on request', version: (Number(order.revised) || 0) + 1, unpriced,
    }));
  }

  const quote = newQuoteId();
  await setBotState(env, chatId, userId, 'confirm', order.order_number, {
    kind: 'approve', quote, version: (Number(order.revised) || 0) + 1, revised: Number(order.revised) || 0,
  });
  return sendChatMessage(env, chatId, formatApproveCard({
    orderNo: order.order_number, total: money(summary.total),
    version: (Number(order.revised) || 0) + 1, unpriced: [],
  }), [[
    { text: 'Approve and send', callback_data: callbackData('approve', quote) },
    { text: 'Cancel', callback_data: callbackData('cancel', quote) },
  ]]);
}

async function handleBotCallback(env, chatId, userId, data) {
  const pressed = parseCallbackData(data);
  if (!pressed) return;

  const state = await getBotState(env, chatId, userId);
  const nothing = 'That button has expired or does not belong to this conversation. Send /edit-invoice to start again.';
  if (!state || state.expired || state.step !== 'confirm' || !state.payload) {
    return sendChatMessage(env, chatId, nothing);
  }
  let payload;
  try { payload = JSON.parse(state.payload); } catch (err) { return sendChatMessage(env, chatId, nothing); }
  // The quote id ties the press to the card it came from, so an old
  // "Save price" cannot apply a newer, different amount.
  if (payload.quote !== pressed.quote) return sendChatMessage(env, chatId, nothing);

  if (pressed.scope === 'cancel') {
    await clearBotState(env, chatId, userId);
    return sendChatMessage(env, chatId, 'Cancelled. Nothing was changed.');
  }
  if (payload.kind === 'approve') return applyApprove(env, chatId, userId, state.order_no, payload);
  return applyPrice(env, chatId, userId, state.order_no, payload, pressed.scope);
}

async function applyPrice(env, chatId, userId, orderNumber, payload, scope) {
  const order = await loadOrder(env, orderNumber);
  if (!order) {
    await clearBotState(env, chatId, userId);
    return sendChatMessage(env, chatId, `No order ${orderNumber}.`);
  }
  const lines = parseStoredLines(order);
  const index = payload.index;
  if (index < 0 || index >= lines.length || lines[index].p !== payload.oldP) {
    await clearBotState(env, chatId, userId);
    return sendChatMessage(env, chatId, 'That order changed while you were confirming. Nothing was saved - send /edit-invoice to start again.');
  }

  let written = payload.newP;
  const line = lines[index];
  let writeScope = scope;
  let scopeNote = '';
  // A cleared price cannot go into the catalogue (price is NOT NULL) and
  // has no business changing what future orders cost anyway.
  if (writeScope === 'save' && written === null) {
    writeScope = 'once';
    scopeNote = '\nCatalogue left unchanged - a cleared price is not a standing price.';
  }
  const catalogueKey = writeScope === 'save' ? payload.catalogueKey : null;
  if (writeScope === 'save' && !catalogueKey) {
    writeScope = 'once';
    scopeNote = '\nCatalogue left unchanged - this line has no catalogue key.';
  }

  const next = lines.map((l, i) => (i === index ? { ...l, p: written } : l));
  const linesJson = JSON.stringify(next);
  const summary = summariseLines(next);
  const oldRevised = Number(order.revised) || 0;
  const newRevised = oldRevised + 1;
  const version = newRevised + 1;
  const newStatus = summary.allPriced ? 'priced' : 'pending';
  const now = new Date().toISOString();

  const statements = [
    // Optimistic guard: if the revision moved under us, this matches nothing
    // and the version insert below collides on UNIQUE(order_number, version),
    // so the whole batch rolls back rather than half-applying.
    env.DB.prepare(
      'UPDATE orders SET lines_json = ?, revised = ?, price_status = ? WHERE order_number = ? AND revised = ?'
    ).bind(linesJson, newRevised, newStatus, order.order_number, oldRevised),
    env.DB.prepare(
      `INSERT INTO invoice_versions (order_number, version, created_at, lines_json, total, reason, actor)
       VALUES (?,?,?,?,?,'order-price',?)`
    ).bind(order.order_number, version, now, linesJson, summary.total, `tg:${userId}`),
    auditStatement(env, {
      chatId, userId, orderNumber: order.order_number, itemKey: catalogueKey,
      action: written === null ? 'price-clear' : 'price-set',
      oldValue: payload.oldP, newValue: written,
      detail: { scope: writeScope, version, line: index + 1, description: line.d, wasApproved: !!payload.wasApproved },
    }),
  ];
  if (catalogueKey) {
    statements.push(env.DB.prepare(
      `INSERT INTO product_prices (item_key, category, label, price, updated_at)
       VALUES (?, 'cakes', ?, ?, ?)
       ON CONFLICT(item_key) DO UPDATE SET
         price = excluded.price, label = excluded.label, updated_at = excluded.updated_at`
    ).bind(catalogueKey, catalogueLabel(order, line), written, now));
  }

  try {
    const results = await env.DB.batch(statements);
    if (!results || !results[0] || !results[0].meta || !results[0].meta.changes) {
      await clearBotState(env, chatId, userId);
      return sendChatMessage(env, chatId, 'That order changed while you were confirming. Nothing was saved.');
    }
  } catch (err) {
    await clearBotState(env, chatId, userId);
    console.error('bot price write:', err && err.name ? err.name : 'error');
    return sendChatMessage(env, chatId, 'Could not save the price - the invoice changed or the database refused it. Nothing was saved.');
  }

  await clearBotState(env, chatId, userId);

  // The revised document goes out to the same chats a new order does.
  const fresh = { ...order, lines_json: linesJson, revised: newRevised, price_status: newStatus };
  await sendInvoiceToCompany(env, fresh, [
    `Invoice ${order.order_number} - revised (v${version})`,
    `Line ${index + 1}: ${line.d}`,
    `${payload.oldP === null ? 'unpriced' : money(payload.oldP)} -> ${written === null ? 'unpriced' : money(written)}`,
    `Total ${summary.allPriced ? money(summary.total) : money(summary.total) + ' + unpriced lines'}`,
    `By ${userId}`,
  ].join('\n'));

  const remaining = summary.unpriced;
  return sendChatMessage(env, chatId, [
    `Saved. Order ${order.order_number} is now v${version}, ${newStatus}.`,
    catalogueKey ? `Catalogue also updated for ${catalogueKey}.` : '',
    remaining ? `${remaining} line${remaining > 1 ? 's' : ''} still unpriced - /approve will refuse until they are set.` : 'Every line is priced - /approve will finalise it.',
    payload.wasApproved ? 'It was approved before this edit, so it needs approving again.' : '',
    'The revised PDF has been sent.',
    scopeNote.trim(),
  ].filter(Boolean).join('\n'));
}

async function applyApprove(env, chatId, userId, orderNumber, payload) {
  const order = await loadOrder(env, orderNumber);
  if (!order) {
    await clearBotState(env, chatId, userId);
    return sendChatMessage(env, chatId, `No order ${orderNumber}.`);
  }
  const lines = parseStoredLines(order);
  const summary = summariseLines(lines);
  const unpriced = lines.map((l, i) => (l.p === null ? i + 1 : null)).filter(Boolean);

  // Re-checked at the moment of approval: the card may be a few minutes
  // old, and the order may have gained an unpriced line since.
  if (unpriced.length) {
    await clearBotState(env, chatId, userId);
    await auditStatement(env, {
      chatId, userId, action: 'approve-refused', orderNumber: order.order_number,
      detail: { reason: 'unpriced-lines', lines: unpriced },
    }).run().catch(err => console.error('audit:', err && err.name ? err.name : 'error'));
    return sendChatMessage(env, chatId, `Cannot approve: ${unpriced.length} line(s) still unpriced (${unpriced.join(', ')}).`);
  }
  if (Number(order.revised) !== payload.revised) {
    await clearBotState(env, chatId, userId);
    return sendChatMessage(env, chatId, 'That invoice was revised while you were confirming. Nothing was approved - start again.');
  }

  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        "UPDATE orders SET price_status = 'approved' WHERE order_number = ? AND revised = ? AND price_status <> 'approved'"
      ).bind(order.order_number, payload.revised),
      auditStatement(env, {
        chatId, userId, orderNumber: order.order_number, action: 'approve',
        oldValue: order.price_status, newValue: 'approved',
        detail: { version: payload.version, total: summary.total },
      }),
    ]);
    if (!results || !results[0] || !results[0].meta.changes) {
      await clearBotState(env, chatId, userId);
      return sendChatMessage(env, chatId, 'Nothing was approved - the order had already changed.');
    }
  } catch (err) {
    await clearBotState(env, chatId, userId);
    console.error('bot approve:', err && err.name ? err.name : 'error');
    return sendChatMessage(env, chatId, 'Could not approve - nothing was changed.');
  }

  await clearBotState(env, chatId, userId);
  await sendInvoiceToCompany(env, { ...order, price_status: 'approved' }, [
    `Invoice ${order.order_number} - APPROVED (v${payload.version})`,
    `Total ${money(summary.total)}`,
    `Approved by ${userId}`,
  ].join('\n'));
  return sendChatMessage(env, chatId, `Approved. Order ${order.order_number} v${payload.version} is final; the PDF has been sent.`);
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });

// Same as json(), but cacheable. Only GET /api/gallery uses it — the
// manifest changes only when you approve or reject something, so a
// minute of edge caching is safe and spares a D1 read per gallery view.
const jsonCached = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...cors },
  });

const clip = (v, max) => String(v == null ? '' : v).slice(0, max);

/* ---------- session tokens: "<expiry>.<hmac>" ---------- */
const enc = new TextEncoder();

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Compares via HMAC so the comparison time doesn't depend on where the
// strings first differ.
async function safeEqual(secret, a, b) {
  return (await hmac(secret, a)) === (await hmac(secret, b));
}

async function makeToken(env) {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return `${exp}.${await hmac(env.SESSION_SECRET, exp)}`;
}

async function isAuthed(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(env.SESSION_SECRET, sig, await hmac(env.SESSION_SECRET, exp));
}

/* ---------- handlers ---------- */
async function handleLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  await env.DB.prepare('DELETE FROM login_attempts WHERE ts < ?').bind(now - LOGIN_WINDOW_MS).run();
  const { results } = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ?').bind(ip).all();
  if (results[0].n >= MAX_FAILED_LOGINS) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
  const ok = await safeEqual(env.SESSION_SECRET, String(body.password || ''), env.ADMIN_PASSWORD);
  if (!ok) {
    await env.DB.prepare('INSERT INTO login_attempts (ip, ts) VALUES (?, ?)').bind(ip, now).run();
    return json({ error: 'Incorrect password' }, 401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
  return json({ token: await makeToken(env), expiresInMs: SESSION_TTL_MS });
}

async function handleCreateOrder(request, env, ctx) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Too large' }, 413);
  let o;
  try { o = JSON.parse(raw); } catch (e) { return json({ error: 'Bad request' }, 400); }
  if (!o || !ORDER_NO_RE.test(String(o.orderNumber || ''))) return json({ error: 'Bad order number' }, 400);

  // Structured lines for the invoice. The items text blob above is still
  // written and still what the admin list and printReceipt render from;
  // this is the machine-readable copy the PDF needs (spec §4.1).
  const linesJson = serializeLines(o.lines);

  // Read the lines back out of the serialised copy rather than re-validating
  // the request: whatever serializeLines dropped to fit the byte ceiling is
  // then missing from the total too, so the stored figure always describes
  // the stored lines (spec §4.1).
  const lines = JSON.parse(linesJson);
  const { total, allPriced } = summariseLines(lines);
  // Spec §7: one unpriced line and the whole invoice waits for a human.
  // An order with no lines at all counts as priced — there is nothing to
  // quote, and holding every empty order for review would be noise.
  const priceStatus = allPriced ? 'priced' : 'pending';

  // Cake match key (spec §5.1): an opaque lookup key the site computes from
  // the cake's tiers/flavour/finish (R3.2), not something to derive twice
  // here. Until the site sends one this stays NULL, which just means every
  // cake is treated as unmatched.
  const specKey = o.specKey ? clip(o.specKey, 200) || null : null;

  const nowIso = new Date().toISOString();
  const info = await env.DB.prepare(
    `INSERT OR IGNORE INTO orders
      (order_number, received_at, order_type, name, phone, delivery, address, date_needed,
       event_type, guests, service_type, items, total, notes, lines_json, price_status, spec_key)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    o.orderNumber, nowIso,
    clip(o.orderType, 40), clip(o.name, 120), clip(o.phone, 40), clip(o.delivery, 20),
    clip(o.address, 300), clip(o.dateNeeded, 200), clip(o.eventType, 60), clip(o.guests, 20),
    clip(o.serviceType, 20), clip(o.items, 12000), clip(o.total, 30), clip(o.notes, 1500),
    linesJson, priceStatus, specKey
  ).run();

  // changes === 0 means the order number already existed: logOrder's
  // sendBeacon/fetch fallback re-sent it. Do not invoice twice.
  if (info.meta && info.meta.changes) {
    // Version 1 is the cart's own document, pending prices and all — the
    // baseline every later revision is compared against (spec §5.4).
    // A failed snapshot must not fail an order that is already logged:
    // lines_json on the row is the live truth, this is the history.
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO invoice_versions
           (order_number, version, created_at, lines_json, total, reason, actor)
         VALUES (?, 1, ?, ?, ?, 'original', 'site')`
      ).bind(o.orderNumber, nowIso, linesJson, total).run();
    } catch (err) {
      console.error('invoice version:', err && err.name ? err.name : 'error');
    }

    const caption = [
      `Invoice ${o.orderNumber}`,
      `${clip(o.name, 120)} - ${clip(o.total, 30) || 'price on request'}`,
      // The operator's cue that this one is not ready to forward.
      priceStatus === 'pending' ? 'PENDING PRICE REVIEW - set a price before sending.' : null,
    ].filter(Boolean).join('\n');

    // The renderer reads row-shaped fields (order_number, received_at), but
    // the request body uses the site's camelCase orderNumber and has no
    // timestamp — so both are supplied here. Without them the delivered PDF
    // prints no order number or issue date, and ships as "undefined.pdf".
    ctx.waitUntil(sendInvoiceToCompany(
      env,
      {
        ...o,
        order_number: o.orderNumber, received_at: nowIso,
        lines_json: linesJson, revised: 0, price_status: priceStatus, spec_key: specKey,
      },
      caption
    ));
  }
  return json({ ok: true });
}

// Admin-only. Renders from lines_json, falling back to the items blob for
// rows that predate the column, so every order in the list can produce a
// document (spec §4.1). Re-validated on read, so a hand-edited row cannot
// inject into the PDF (spec §9).
async function handleGetInvoice(env, orderNumber) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE order_number = ?')
    .bind(orderNumber).first();
  if (!order) return json({ error: 'Not found' }, 404);

  const bytes = renderInvoice({ ...order, lines_json: JSON.stringify(parseStoredLines(order)) });
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="LaCreme-Invoice-${order.order_number}.pdf"`,
      'Cache-Control': 'no-store',
      ...cors,
    },
  });
}

async function handleListOrders(url, env) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const status = url.searchParams.get('status') || '';
  const type = url.searchParams.get('type') || '';
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 300);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const where = [], args = [];
  if (q) {
    where.push('(order_number LIKE ? OR name LIKE ? OR phone LIKE ? OR items LIKE ?)');
    const like = `%${q.replace(/[%_]/g, '')}%`;
    args.push(like, like, like, like);
  }
  if (STATUSES.includes(status)) { where.push('status = ?'); args.push(status); }
  if (type) { where.push('order_type LIKE ?'); args.push(`%${type.replace(/[%_]/g, '')}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await env.DB.prepare(`SELECT * FROM orders ${clause} ORDER BY received_at DESC LIMIT ? OFFSET ?`)
    .bind(...args, limit, offset).all();
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM orders ${clause}`).bind(...args).all();
  return json({ orders: rows.results, total: count.results[0].n });
}

async function handleUpdateOrder(request, env, orderNumber) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
  if (!STATUSES.includes(body.status)) return json({ error: 'Bad status' }, 400);
  await env.DB.prepare('UPDATE orders SET status = ? WHERE order_number = ?').bind(body.status, orderNumber).run();
  return json({ ok: true });
}

async function handleUpload(request, env, ctx) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  // Cheapest rejection first — never parse a body we're going to refuse.
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > UPLOAD_MAX_BYTES) return json({ error: 'That photo is too large.' }, 413);
  if (await uploadRateLimited(ip, env)) {
    return json({ error: 'Too many uploads right now — try again later.' }, 429);
  }

  let form;
  try { form = await request.formData(); } catch (e) { return json({ error: 'Bad request' }, 400); }

  const file = form.get('file');
  const category = String(form.get('category') || '');
  const clientBatchId = String(form.get('clientBatchId') || '').trim();
  const declaredTotal = Number(form.get('batchTotal')) || 1;
  const filename = clip(form.get('filename') || (file && file.name) || 'photo', 200);

  if (!file || typeof file === 'string') return json({ error: 'No photo received.' }, 400);
  if (!MEDIA_CATEGORIES.includes(category)) return json({ error: 'Unknown category.' }, 400);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientBatchId)) return json({ error: 'Bad batch id.' }, 400);
  if (declaredTotal < 1 || declaredTotal > UPLOAD_MAX_BATCH) {
    return json({ error: 'Too many photos in one upload.' }, 429);
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: 'That file is empty.' }, 400);
  if (bytes.byteLength > UPLOAD_MAX_BYTES) return json({ error: 'That photo is too large.' }, 413);

  const nowIso = new Date().toISOString();
  const batch = await ensureBatch(env, clientBatchId, category, declaredTotal, nowIso);
  if (batch.category !== category) return json({ error: 'One upload must stay in one category.' }, 400);
  if (batch.stored_count + batch.failed_count >= UPLOAD_MAX_BATCH) {
    return json({ error: 'Too many photos in one upload.' }, 429);
  }

  const width = Math.max(0, Math.min(20000, Number(form.get('clientWidth')) || 0));
  const height = Math.max(0, Math.min(20000, Number(form.get('clientHeight')) || 0));
  const key = `img/${slugifyCategory(category)}/${crypto.randomUUID()}.jpg`;

  let imageUrl = '', failure = null;
  try {
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    const head = await env.MEDIA.head(key);
    if (!head || head.size !== bytes.byteLength) throw new Error('read-back size mismatch');
    imageUrl = `${R2_BASE_URL}/${key}`;
  } catch (err) {
    failure = err && err.message ? err.message : String(err);
  }

  if (failure) {
    // Record the failure rather than 500-ing: the client will retry the
    // whole file, and if it also fails we still have a row to show.
    await env.DB.prepare(
      `INSERT INTO upload_items
         (batch_id, filename, r2_key, image_url, bytes, width, height, status, error, received_at)
       VALUES (?, ?, ?, '', ?, ?, ?, 'Failed', ?, ?)`
    ).bind(batch.id, filename, key, bytes.byteLength, width, height, clip(failure, 300), nowIso).run();
    await bumpBatch(env, batch, 0, 1, 0);
    // Once per batch — a 23-file batch that fails 5 times must not buzz
    // the phone 5 times (spec 8).
    if (!batch.failure_notified) {
      await env.DB.prepare('UPDATE upload_batches SET failure_notified = 1 WHERE id = ?').bind(batch.id).run();
      ctx.waitUntil(sendTelegram(env,
        `⚠️ Upload Issue\n` +
        `${batch.failed_count + 1} of ${batch.file_count} photo${batch.file_count === 1 ? '' : 's'} failed to store (${batch.category}).\n` +
        `The file is still on her phone — ask her to retry.`
      ));
    }
    return json({ error: 'We could not store that photo. Please try again.' }, 502);
  }

  await env.DB.prepare(
    `INSERT INTO upload_items
       (batch_id, filename, r2_key, image_url, bytes, width, height, status, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`
  ).bind(batch.id, filename, key, imageUrl, bytes.byteLength, width, height, nowIso).run();
  // First successful file in this batch -> one notification for the whole
  // upload, not one per photo (spec 8: "sent once per batch"). Gate on
  // stored_count alone: an earlier failure in this batch must not silence
  // the "needs review" message.
  if (batch.stored_count === 0) {
    ctx.waitUntil(sendTelegram(env,
      `🔔 New Gallery Upload\n` +
      `${batch.file_count} photo${batch.file_count === 1 ? '' : 's'} uploaded by the business owner.\n` +
      `Category: ${batch.category}\n` +
      `Awaiting your review`
    ));
  }
  await bumpBatch(env, batch, 1, 0, bytes.byteLength);

  return json({ id: key, r2Key: key, imageUrl }, 201);
}

async function handleGallery(env) {
  // Manifest is date-added, newest first: order by received_at (upload
  // time), not approved_at — approving an older batch after a newer one
  // must not bury the newer photos.
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.image_url, i.width, i.height, b.category
       FROM upload_items i
       JOIN upload_batches b ON b.id = i.batch_id
      WHERE i.status = 'Approved'
      ORDER BY i.received_at DESC, i.id DESC
      LIMIT 500`
  ).all();

  // Shape matches GALLERY_ITEMS so gallery.js can append these straight
  // onto the hardcoded array. id is namespaced 'u<rowid>' so it can never
  // collide with the numeric ids in gallery-data.js (spec 9).
  return jsonCached(results.map(r => ({
    id: 'u' + r.id,
    category: r.category,
    image: r.image_url,
    aspect: (r.width > 0 && r.height > 0) ? Number((r.width / r.height).toFixed(4)) : 0.75,
    iconKey: 'cake',
    caption: '',
    sub: '',
  })));
}

async function handleListUploads(env) {
  const { results } = await env.DB.prepare(
    `SELECT b.id, b.received_at, b.category, b.file_count, b.stored_count,
            b.failed_count, b.total_bytes, b.status,
            COALESCE(SUM(CASE WHEN i.status = 'Approved' THEN 1 ELSE 0 END), 0) AS approved,
            COALESCE(SUM(CASE WHEN i.status = 'Pending'  THEN 1 ELSE 0 END), 0) AS pending,
            COALESCE(SUM(CASE WHEN i.status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejected,
            COALESCE(SUM(CASE WHEN i.status = 'Failed'   THEN 1 ELSE 0 END), 0) AS failed
       FROM upload_batches b
       LEFT JOIN upload_items i ON i.batch_id = b.id
      GROUP BY b.id
      ORDER BY b.received_at DESC
      LIMIT 100`
  ).all();
  return json({ batches: results });
}

async function handleGetUpload(env, id) {
  const batch = await env.DB.prepare(
    'SELECT * FROM upload_batches WHERE id = ?'
  ).bind(id).first();
  if (!batch) return json({ error: 'Not found' }, 404);
  const { results } = await env.DB.prepare(
    'SELECT * FROM upload_items WHERE batch_id = ? ORDER BY id'
  ).bind(id).all();
  return json({ batch, items: results });
}

async function handleUpdateUpload(request, env, id) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
  const status = String(body.status || '');
  // 'Pending' is accepted as well as the two spec 6.3 statuses so a
  // mis-click is genuinely reversible: spec 6.3 says a rejected item's
  // R2 object is "retained … so a mis-click is recoverable", and without
  // a way back to Pending that claim would be false — Approve would be
  // the only escape and it would publish without review.
  if (status !== 'Approved' && status !== 'Rejected' && status !== 'Pending') {
    return json({ error: 'Bad status' }, 400);
  }

  const item = await env.DB.prepare(
    'SELECT * FROM upload_items WHERE id = ?'
  ).bind(id).first();
  if (!item) return json({ error: 'Not found' }, 404);
  if (item.status === 'Failed') {
    return json({ error: 'This photo never reached storage — re-send it from the upload page.' }, 409);
  }

  await env.DB.prepare(
    'UPDATE upload_items SET status = ? WHERE id = ?'
  ).bind(status, id).run();
  return json({ ok: true, status });
}

async function handleRetryUpload(env, id) {
  const item = await env.DB.prepare(
    'SELECT * FROM upload_items WHERE id = ?'
  ).bind(id).first();
  if (!item) return json({ error: 'Not found' }, 404);
  if (item.status !== 'Failed') return json({ error: 'Only failed photos can be retried.' }, 400);

  // The bytes are never retained server-side, so retry can only recover a
  // case where the R2 write landed but we failed to confirm it. If the
  // object genuinely is not there, say so plainly — the owner re-sends
  // from her phone, which is what spec 8's failure message tells her.
  const head = await env.MEDIA.head(item.r2_key);
  if (head && head.size === item.bytes) {
    // handleUpload's failure path bumped this batch (failed +1); reverse
    // it now that the photo recovered, or GET /api/uploads would keep
    // reporting the batch as failed/Partial forever. bumpBatch recomputes
    // status, so a fully-recovered batch returns to Complete.
    const batch = await env.DB.prepare('SELECT * FROM upload_batches WHERE id = ?').bind(item.batch_id).first();
    if (batch) await bumpBatch(env, batch, 1, -1, item.bytes);
    await env.DB.prepare(
      `UPDATE upload_items
          SET status = 'Pending', error = NULL, image_url = ?
        WHERE id = ?`
    ).bind(`${R2_BASE_URL}/${item.r2_key}`, id).run();
    return json({ ok: true, recovered: true });
  }
  return json({ error: 'The photo never reached storage — re-send it from the upload page.' }, 409);
}

/* ---------- scheduled: 30-day retention sweep ---------- */
// Runs daily via [triggers] in wrangler.toml. Purges Rejected/Failed
// upload_items once they are older than the owner-approved 30-day window.
// Approved and Pending are never candidates: a mis-click has to stay
// recoverable for the full 30 days (see the comment on handleUpdateUpload),
// and a Pending item is still waiting on review.
async function retentionSweep(env) {
  // received_at is always written as new Date().toISOString(), so a plain
  // string comparison against another ISO-8601 cutoff is correct.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { results: items } = await env.DB.prepare(
    `SELECT id, batch_id, r2_key, bytes, status
       FROM upload_items
      WHERE status IN ('Rejected','Failed') AND received_at < ?
      ORDER BY received_at
      LIMIT 200`
  ).bind(cutoff).all();

  // Per-batch arithmetic, accumulated as rows disappear, so handleListUploads'
  // stored_count/failed_count/total_bytes keep agreeing with its live item
  // aggregates (otherwise the dashboard shows ghost counts after a sweep).
  const deltas = new Map(); // batch_id -> { stored, failed, bytes }
  const counts = { Rejected: 0, Failed: 0 };
  let errors = 0;

  for (const item of items) {
    try {
      // R2 first: if this throws, the row survives untouched and the next
      // run retries. The reverse order could strand an orphan object forever.
      await env.MEDIA.delete(item.r2_key);
      await env.DB.prepare('DELETE FROM upload_items WHERE id = ?').bind(item.id).run();
    } catch (err) {
      errors++;
      console.error(`retention sweep: could not delete item ${item.id} (${item.r2_key}):`, err);
      continue;
    }
    counts[item.status]++;
    const d = deltas.get(item.batch_id) || { stored: 0, failed: 0, bytes: 0 };
    if (item.status === 'Rejected') {
      d.stored -= 1;
      d.bytes -= item.bytes;  // stored items added their bytes (handleUpload)
    } else {
      d.failed -= 1;          // the failure path added 0 bytes, so subtract 0
    }
    deltas.set(item.batch_id, d);
  }

  let batchesRemoved = 0;
  for (const [batchId, d] of deltas) {
    try {
      const { results } = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM upload_items WHERE batch_id = ?'
      ).bind(batchId).all();
      if (results[0].n === 0) {
        await env.DB.prepare('DELETE FROM upload_batches WHERE id = ?').bind(batchId).run();
        batchesRemoved++;
        continue;
      }
      // Batch still has live items: reconcile the counters in place.
      const batch = await env.DB.prepare('SELECT * FROM upload_batches WHERE id = ?').bind(batchId).first();
      if (batch) await bumpBatch(env, batch, d.stored, d.failed, d.bytes);
    } catch (err) {
      errors++;
      console.error(`retention sweep: could not reconcile batch ${batchId}:`, err);
    }
  }

  const deleted = counts.Rejected + counts.Failed;
  console.log(
    `retention sweep: ${deleted} deleted (${counts.Failed} failed, ${counts.Rejected} rejected), ` +
    `${batchesRemoved} batches removed, ${errors} errors`
  );
}

export default {
  // ctx is Cloudflare's execution context: ctx.waitUntil() is what lets
  // a notification keep running after this handler returns its Response.
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/orders' && request.method === 'POST') return await handleCreateOrder(request, env, ctx);
      if (url.pathname === '/api/login' && request.method === 'POST') return await handleLogin(request, env);
      if (url.pathname === '/api/upload' && request.method === 'POST') return await handleUpload(request, env, ctx);
      if (url.pathname === '/api/gallery' && request.method === 'GET') return await handleGallery(env);

      // Telegram's webhook authenticates with the secret in its path, not a
      // session token, so it is matched before the /api/ auth gate below.
      // Every other shape under /api/tg/ is a 404, including a GET.
      if (url.pathname === '/api/tg' || url.pathname.startsWith('/api/tg/')) {
        const mt = url.pathname.match(/^\/api\/tg\/([^/]+)$/);
        if (!mt || request.method !== 'POST') return webhookMiss();
        return await handleTelegramWebhook(request, env, ctx, mt[1]);
      }

      if (url.pathname.startsWith('/api/')) {
        if (!(await isAuthed(request, env))) return json({ error: 'Unauthorized' }, 401);
        if (url.pathname === '/api/orders' && request.method === 'GET') return await handleListOrders(url, env);
        // Match /invoice before the bare /:no matcher, same reason as /retry below.
        const mi = url.pathname.match(/^\/api\/orders\/([\w-]+)\/invoice$/);
        if (mi && request.method === 'GET') return await handleGetInvoice(env, mi[1]);
        const m = url.pathname.match(/^\/api\/orders\/([\w-]+)$/);
        if (m && request.method === 'PATCH') return await handleUpdateOrder(request, env, m[1]);
        if (url.pathname === '/api/uploads' && request.method === 'GET') return await handleListUploads(env);
        // Match /retry before /:id — a bare prefix match would swallow it.
        const mr = url.pathname.match(/^\/api\/uploads\/(\d+)\/retry$/);
        if (mr && request.method === 'POST') return await handleRetryUpload(env, Number(mr[1]));
        const mu = url.pathname.match(/^\/api\/uploads\/(\d+)$/);
        if (mu && request.method === 'GET') return await handleGetUpload(env, Number(mu[1]));
        if (mu && request.method === 'PATCH') return await handleUpdateUpload(request, env, Number(mu[1]));
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'Server error' }, 500);
    }
  },

  // Cron entry point (see [triggers] in wrangler.toml). Awaited rather
  // than deferred with ctx.waitUntil() so the summary and any failure are
  // always flushed to this invocation's logs before it returns; the catch
  // keeps an unexpected throw from becoming an unhandled rejection.
  async scheduled(event, env, ctx) {
    try {
      await retentionSweep(env);
    } catch (err) {
      console.error('retention sweep failed:', err);
    }
  },
};
