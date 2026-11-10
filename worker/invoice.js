/* ============================================================
   LA CRÈME — INVOICE MODULE (pure: no env, no I/O)

   Spec: docs/superpowers/specs/2026-11-09-invoice-revision-design.md
   Plan: docs/superpowers/plans/2026-11-09-invoice-revision-plan.md

   Exports:
     parseInvoiceChatIds(secret) -> string[]   who receives invoices
     validateLines(raw)          -> array       sanitised line items
     parseStoredLines(order)     -> array       what to print for a row
     renderInvoice(order)        -> Uint8Array  the PDF
     DEFAULT_SETTINGS            -> object       blank business details

   Everything here is deterministic and testable in isolation; the
   Worker wiring lives in index.js.
============================================================ */

import { LOGO } from './logo-data.js';

// Spec §4.1: cap the array and the serialised size, same ceiling as
// the items text blob.
export const MAX_INVOICE_LINES = 100;
export const MAX_LINES_BYTES = 12000;

// Spec §7.1a: ONE bot, TWO destinations. Upload alerts keep using
// TELEGRAM_CHAT_ID; invoices use this comma-separated list, so adding
// a sales rep is `wrangler secret put` and nothing else. The cap is a
// guard against a fat-fingered secret fanning out to hundreds of chats.
export function parseInvoiceChatIds(secret) {
  const ids = String(secret || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return [...new Set(ids)].slice(0, 20);
}

// A malformed line must never lose the order (spec §6). Each entry is
// accepted only if it is an object with a usable description, a
// positive integer quantity and a non-negative price or null; anything
// else is dropped rather than rejected. Re-run on read too, so a
// hand-edited row cannot inject into the PDF (spec §9).
export function validateLines(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object') continue;
    const d = typeof l.d === 'string' ? l.d.trim().slice(0, 160) : '';
    if (!d) continue;
    const q = Number(l.q);
    if (!Number.isInteger(q) || q < 1 || q > 9999) continue;
    const p = l.p === null || l.p === undefined ? null : Number(l.p);
    if (p !== null && (!Number.isFinite(p) || p < 0)) continue;
    out.push({ d, q, p: p === null ? null : Math.round(p) });
    if (out.length >= MAX_INVOICE_LINES) break;
  }
  return out;
}

// Serialises for storage, dropping from the tail until it fits the
// 12,000-byte ceiling (spec §4.1). Dropping beats rejecting: the order
// must still be logged. Measured in UTF-8 bytes, not characters — a
// description with an accent is two bytes and the cap is a byte cap.
export function serializeLines(raw) {
  const lines = validateLines(raw);
  let json = JSON.stringify(lines);
  while (lines.length > 1 && new TextEncoder().encode(json).length > MAX_LINES_BYTES) {
    lines.pop();
    json = JSON.stringify(lines);
  }
  return json;
}

// Reads what is actually in the row. New orders carry JSON in
// lines_json; old ones (lines_json IS NULL) fall back to the items text
// blob rendered as unpriced lines, so a historical order still produces
// a document (spec §4.1). Unpriced because the blob's own "— ₦2,000"
// suffix is a display string, not a price we can trust for a total.
export function parseStoredLines(order) {
  if (order && order.lines_json) {
    try {
      return validateLines(JSON.parse(order.lines_json));
    } catch (e) { /* fall through to the blob */ }
  }
  const blob = String((order && order.items) || '');
  const out = [];
  for (const text of blob.split('\n')) {
    const d = text.trim().slice(0, 160);
    if (!d) continue;
    out.push({ d, q: 1, p: null });
    if (out.length >= MAX_INVOICE_LINES) break;
  }
  return out;
}

// Business details that live in D1 `settings` (spec §5.2). Blank values
// omit their line rather than printing an empty label, so the invoice is
// shippable before the owner supplies them and gets richer as they land —
// no code change either way.
export const DEFAULT_SETTINGS = {
  company_name: 'LA CRÈME',
  company_phone: '',
  company_address: '',
  bank_name: '',
  account_name: '',
  account_number: '',
};

/* ============================================================
   THE PDF

   Hand-rolled, zero dependencies. A header, a wrapped line table, a
   total and a payment block do not need a PDF library, and Workers
   cannot take a native one (spec §2).

   Deliberate choices:
   - Content streams are NOT compressed — a few KB either way, and it
     keeps the output greppable when verifying.
   - Base-14 fonts only, WinAnsiEncoding. Any character outside Latin-1
     is transliterated before it reaches the page (spec §6.6), so no '?'
     substitutions appear in real order text.
   - The logo is a baseline JPEG embedded verbatim as /DCTDecode. No
     decoding, no image library — but also no alpha, so it is only ever
     drawn on white.
   - Object numbers are reserved lazily and the xref is built from the
     final byte offsets, so adding an object can never desync the table.
============================================================ */

const PAGE_W = 595, PAGE_H = 842;          // A4, points
const MARGIN = 48;
const FONT_R = 'F1', FONT_B = 'F2';        // Helvetica / Helvetica-Bold

// Column edges. The three money columns are right-aligned to these.
const COL_NO = MARGIN;
const COL_DESC = MARGIN + 24;
const COL_QTY_R = 400;
const COL_UNIT_R = 480;
const COL_AMT_R = PAGE_W - MARGIN;
const DESC_W = COL_QTY_R - COL_DESC - 20;

const LINE_H = 12;                          // spacing inside a wrapped cell
const MIN_ROW_H = 15;

// Spec §2.2 — red dominant, gold accent, body text black.
const RED = '0.784 0.063 0.180';            // #C8102E
const GOLD = '0.780 0.631 0.333';           // #C7A155
const BLACK = '0 0 0';
const WHITE = '1 1 1';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "NGN 38,000". Base-14 fonts have no naira glyph, so the PDF says NGN
// and the rest of the business keeps saying ₦ (spec §2).
function money(n) {
  const v = Math.round(Number(n) || 0);
  return 'NGN ' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// UTC on purpose: received_at is written as an ISO string, and the
// printed date must not shift with whoever's clock renders it.
function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso || '').slice(0, 10);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Spec §2.3: 07 Nov 2026 everywhere. date_needed is free text, so only
// something that actually looks like a date is reformatted — "Next
// Saturday" is printed exactly as the customer typed it. Multiple dates
// arrive joined by ' | ' (cakeCart joins them that way).
function fmtDateText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .split('|')
    .map(part => {
      const p = part.trim();
      if (!p) return '';
      if (/^\d{4}-\d{2}-\d{2}/.test(p)) return fmtDate(p);
      return p;
    })
    .filter(Boolean)
    .join(', ');
}

// Spec §6.6: everything must render. These characters have no glyph in a
// base-14 font, so they are transliterated rather than turned into '?'.
function translit(str) {
  return String(str)
    .replace(/[—–]/g, '-')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/₦/g, 'NGN ')
    .replace(/…/g, '...')
    .replace(/ /g, ' ');
}

// A PDF literal string: escape \ ( ) and clamp to Latin-1.
function pdfString(s) {
  return '(' + translit(s)
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?') + ')';
}

// Approximate Helvetica advance widths, used only to wrap, right-align
// and position. Exact AFM metrics would be 200 numbers for a point or
// two of accuracy on the strings we actually print.
const NARROW = "iljtfrI.,:;'!|()[] ";
const WIDE = 'mwMW';
function textWidth(str, size) {
  let w = 0;
  for (const ch of String(str)) {
    let f = 0.556;
    if (NARROW.includes(ch)) f = 0.278;
    else if (WIDE.includes(ch)) f = 0.833;
    else if (ch >= 'A' && ch <= 'Z') f = 0.667;
    w += f;
  }
  return w * size;
}

// Spec §2.4: never truncate. Greedy word wrap; a single word wider than
// the column is hard-split so it can never overrun the next column.
function wrap(text, size, maxW) {
  const words = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!word) continue;
    const candidate = line ? line + ' ' + word : word;
    if (textWidth(candidate, size) <= maxW) { line = candidate; continue; }
    if (line) { lines.push(line); line = ''; }
    if (textWidth(word, size) <= maxW) { line = word; continue; }
    let chunk = '';
    for (const ch of word) {
      if (chunk && textWidth(chunk + ch, size) > maxW) { lines.push(chunk); chunk = ch; }
      else chunk += ch;
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// One byte per char, matching the declared WinAnsiEncoding. The xref
// offsets are byte offsets, so this must agree with the assembler.
function latin1(str) {
  return Uint8Array.from(String(str), ch => ch.charCodeAt(0) & 0xff);
}

// Base64 -> bytes, for the embedded JPEG. Decoded once per isolate.
let _logoBytes = null;
function logoBytes() {
  if (_logoBytes) return _logoBytes;
  const bin = atob(LOGO.jpeg);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  _logoBytes = out;
  return out;
}

export function renderInvoice(order) {
  const o = order || {};
  const s = { ...DEFAULT_SETTINGS, ...(o.settings || {}) };
  const lines = parseStoredLines(o);

  // `revised` counts revisions: 0 = original (v1), 1 = first revision (v2).
  const revisions = Number(o.revised) || 0;
  const version = revisions + 1;
  const isPending = o.price_status === 'pending';
  const companyName = String(s.company_name || '').trim() || 'LA CRÈME';

  const pages = [];
  let ops = null;
  let y = 0;

  const newPage = () => { ops = []; pages.push(ops); y = PAGE_H - MARGIN; };
  const put = (str) => ops.push(str);

  const text = (x, yy, str, font, size, colour) => {
    if (colour) put(`${colour} rg`);
    put(`BT /${font} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${pdfString(str)} Tj ET`);
  };
  const right = (xr, yy, str, font, size, colour) =>
    text(xr - textWidth(str, size), yy, str, font, size, colour);

  const hrule = (yy, x1, x2, colour, width = 0.6) =>
    put(`${colour} RG ${width} w ${x1} ${yy.toFixed(2)} m ${x2} ${yy.toFixed(2)} l S`);

  const fillRect = (x, yy, w, h, colour) =>
    put(`${colour} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);

  // Draws the logo with its bottom-left corner at (x, yy).
  const drawLogo = (x, yy, h) => {
    const w = h * (LOGO.width / LOGO.height);
    put(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${yy.toFixed(2)} cm /Im1 Do Q`);
    return w;
  };

  const tableHead = () => {
    fillRect(MARGIN, y - 4, COL_AMT_R - MARGIN, 15, RED);
    const ty = y + 0.5;
    text(COL_NO, ty, '#', FONT_B, 8, WHITE);
    text(COL_DESC, ty, 'DESCRIPTION', FONT_B, 8, WHITE);
    right(COL_QTY_R, ty, 'QTY', FONT_B, 8, WHITE);
    right(COL_UNIT_R, ty, 'UNIT', FONT_B, 8, WHITE);
    right(COL_AMT_R, ty, 'AMOUNT', FONT_B, 8, WHITE);
    y -= 19;
  };

  const header = (first) => {
    if (first) {
      const lp = drawLogo(MARGIN, y - 40, 40);
      const cx = MARGIN + lp + 16;

      text(cx, y - 13, companyName, FONT_B, 17, RED);
      let cy = y - 27;
      const contactW = COL_AMT_R - cx - 150;
      if (s.company_phone) {
        text(cx, cy, s.company_phone, FONT_R, 9, BLACK); cy -= 11;
      }
      if (s.company_address) {
        for (const ln of wrap(s.company_address, 9, contactW)) {
          text(cx, cy, ln, FONT_R, 9, BLACK); cy -= 11;
        }
      }

      right(COL_AMT_R, y - 13, 'INVOICE', FONT_B, 15, RED);
      right(COL_AMT_R, y - 27, `No. ${o.order_number || ''}`, FONT_R, 9, BLACK);
      right(COL_AMT_R, y - 39, `Issued ${fmtDate(o.received_at)}`, FONT_R, 9, BLACK);

      let ry = y - 53;
      // Spec §2.8: prominent, beside the invoice number, not a footnote.
      if (revisions > 0) {
        const label = `REVISED: V${version}`;
        const tw = textWidth(label, 8);
        fillRect(COL_AMT_R - tw - 12, ry - 3, tw + 12, 14, RED);
        text(COL_AMT_R - tw - 6, ry + 1, label, FONT_B, 8, WHITE);
        ry -= 18;
      }

      y = Math.min(cy, ry) - 8;
      hrule(y, MARGIN, COL_AMT_R, RED, 1.2);
      y -= 16;

      if (isPending) {
        fillRect(MARGIN, y - 13, COL_AMT_R - MARGIN, 16, RED);
        text(MARGIN + 8, y - 9, 'PENDING PRICE REVIEW - NOT FOR CUSTOMER', FONT_B, 8.5, WHITE);
        y -= 26;
      }

      text(MARGIN, y, String(o.name || 'Customer'), FONT_B, 10, BLACK);
      y -= 13;
      if (o.phone) { text(MARGIN, y, `Phone: ${o.phone}`, FONT_R, 9, BLACK); y -= 11; }
      const delivery = [o.delivery, o.address].filter(Boolean).join(': ');
      if (delivery) {
        for (const ln of wrap(delivery, 9, COL_AMT_R - MARGIN)) {
          text(MARGIN, y, ln, FONT_R, 9, BLACK); y -= 11;
        }
      }
      const needed = fmtDateText(o.date_needed);
      if (needed) { text(MARGIN, y, `Needed: ${needed}`, FONT_R, 9, BLACK); y -= 11; }

      y -= 6;
      hrule(y, MARGIN, COL_AMT_R, GOLD, 0.8);
      y -= 16;
    } else {
      const lp = drawLogo(MARGIN, y - 20, 20);
      text(MARGIN + lp + 10, y - 7, companyName, FONT_B, 11, RED);
      right(COL_AMT_R, y - 7, `Invoice ${o.order_number || ''} (continued)`, FONT_R, 9, BLACK);
      y -= 24;
      hrule(y, MARGIN, COL_AMT_R, RED, 1);
      y -= 16;
    }
    tableHead();
  };

  newPage();
  header(true);

  // Keep clear of the footer/conclusion band.
  const BOTTOM = MARGIN + 46;
  let total = 0, anyUnpriced = false;

  if (!lines.length) {
    text(COL_DESC, y, '(no line items recorded)', FONT_R, 9, BLACK);
    y -= MIN_ROW_H;
  }

  lines.forEach((l, i) => {
    const descLines = wrap(l.d, 9, DESC_W);
    const rowH = Math.max(MIN_ROW_H, descLines.length * LINE_H + 3);

    // A wrapped row moves whole to the next page — never split across one.
    if (y - rowH < BOTTOM) { newPage(); header(false); }

    const amount = l.p === null ? null : l.q * l.p;
    if (amount === null) anyUnpriced = true; else total += amount;

    const top = y;
    text(COL_NO, top, String(i + 1), FONT_R, 9, BLACK);
    descLines.forEach((ln, k) => text(COL_DESC, top - k * LINE_H, ln, FONT_R, 9, BLACK));
    right(COL_QTY_R, top, String(l.q), FONT_R, 9, BLACK);
    right(COL_UNIT_R, top, l.p === null ? '-' : money(l.p), FONT_R, 9, BLACK);
    right(COL_AMT_R, top, amount === null ? 'Price via WhatsApp' : money(amount), FONT_R, 9, BLACK);

    y = top - rowH;
  });

  // Total, payment block and conclusion need room together.
  if (y < BOTTOM + 130) { newPage(); header(false); }

  y -= 6;
  hrule(y, MARGIN, COL_AMT_R, GOLD, 0.8);
  y -= 17;

  right(COL_UNIT_R, y, 'TOTAL', FONT_B, 10, BLACK);
  // Nothing priced at all (a cake-only order) must not read as "NGN 0" —
  // that looks like a free cake. Say what the cart says instead.
  const nothingPriced = anyUnpriced && total === 0;
  right(COL_AMT_R, y, nothingPriced ? 'Price via WhatsApp' : money(total), FONT_B, 11, RED);
  if (anyUnpriced && !nothingPriced) {
    y -= 12;
    right(COL_AMT_R, y, '(excluding items priced on WhatsApp)', FONT_R, 8, BLACK);
  }
  y -= 22;

  // Spec §2.6: total first, then payment details left with the logo right.
  const hasPayment = !!(s.bank_name || s.account_name || s.account_number);
  if (hasPayment) {
    hrule(y, MARGIN, COL_AMT_R, GOLD, 0.5);
    y -= 15;

    const logoH = 38;
    const logoW = logoH * (LOGO.width / LOGO.height);
    const blockTop = y + 4;
    drawLogo(COL_AMT_R - logoW, Math.max(blockTop - logoH, MARGIN + 30), logoH);

    text(MARGIN, y, 'PAYMENT DETAILS', FONT_B, 8, RED); y -= 13;
    if (s.bank_name) { text(MARGIN, y, `Bank: ${s.bank_name}`, FONT_R, 9, BLACK); y -= 11; }
    if (s.account_name) { text(MARGIN, y, `Account name: ${s.account_name}`, FONT_R, 9, BLACK); y -= 11; }
    if (s.account_number) { text(MARGIN, y, `Account number: ${s.account_number}`, FONT_R, 9, BLACK); y -= 11; }
  }

  // Spec §2.6: conclusion at the bottom, centred, capitals. Last page only —
  // on a continuation page it would read as a mid-document goodbye.
  const last = pages[pages.length - 1];
  const conclusion = 'THANK YOU FOR CHOOSING LA\'CREME!';
  last.push(
    `${RED} rg BT /${FONT_B} 9 Tf ` +
    `${((PAGE_W - textWidth(conclusion, 9)) / 2).toFixed(2)} ${(MARGIN + 16).toFixed(2)} Td ` +
    `${pdfString(conclusion)} Tj ET`
  );

  // Page numbers on every sheet, once the count is known.
  pages.forEach((p, i) => {
    if (pages.length > 1) {
      const pn = `Page ${i + 1} of ${pages.length}`;
      p.push(`BT /${FONT_R} 8 Tf ${(COL_AMT_R - textWidth(pn, 8)).toFixed(2)} ${MARGIN} Td ${pdfString(pn)} Tj ET`);
    }
  });

  /* ---- assemble: objects, then xref from real byte offsets ---- */
  const objs = [];
  const reserve = () => { objs.push(null); return objs.length; };
  const setObj = (id, body) => { objs[id - 1] = body; };

  const catalogId = reserve();
  const pagesId = reserve();
  const pageIds = pages.map(() => reserve());
  const fontRId = reserve();
  const fontBId = reserve();
  const imageId = reserve();
  const contentIds = pages.map(() => reserve());

  setObj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  setObj(pagesId,
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  setObj(fontRId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  setObj(fontBId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  // The one binary object in the file. Kept as bytes so the assembler
  // never runs it through latin1() and corrupts the JPEG.
  {
    const jpeg = logoBytes();
    const head = latin1(
      `<< /Type /XObject /Subtype /Image /Width ${LOGO.width} /Height ${LOGO.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
    );
    const tail = latin1('\nendstream');
    const body = new Uint8Array(head.length + jpeg.length + tail.length);
    body.set(head, 0);
    body.set(jpeg, head.length);
    body.set(tail, head.length + jpeg.length);
    setObj(imageId, body);
  }

  pages.forEach((p, i) => {
    const content = p.join('\n');
    setObj(contentIds[i], `<< /Length ${latin1(content).length} >>\nstream\n${content}\nendstream`);
    setObj(pageIds[i],
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fontRId} 0 R /F2 ${fontBId} 0 R >> ` +
      `/XObject << /Im1 ${imageId} 0 R >> >> ` +
      `/Contents ${contentIds[i]} 0 R >>`);
  });

  const chunks = [];
  let offset = 0;
  const pushStr = (str) => { const b = latin1(str); chunks.push(b); offset += b.length; };

  pushStr('%PDF-1.4\n');
  const offsets = [];
  for (let i = 0; i < objs.length; i++) {
    offsets[i] = offset;
    pushStr(`${i + 1} 0 obj\n`);
    const body = objs[i];
    if (typeof body === 'string') {
      pushStr(body);
    } else {
      chunks.push(body);
      offset += body.length;
    }
    pushStr('\nendobj\n');
  }
  const xrefStart = offset;
  pushStr(`xref\n0 ${objs.length + 1}\n`);
  pushStr('0000000000 65535 f \n');
  for (const off of offsets) pushStr(String(off).padStart(10, '0') + ' 00000 n \n');
  pushStr(`trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(offset);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}