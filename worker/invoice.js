/* ============================================================
   LA CRÈME — INVOICE MODULE (pure: no env, no I/O)

   Spec: docs/superpowers/specs/2026-11-06-invoice-workflow-design.md
   Plan: docs/superpowers/plans/2026-11-06-invoice-inv1.md

   Four exports:
     parseInvoiceChatIds(secret) -> string[]   who receives invoices
     validateLines(raw)          -> array       sanitised line items
     parseStoredLines(order)     -> array       what to print for a row
     renderInvoice(order)        -> Uint8Array  the PDF

   Everything here is deterministic and testable in isolation; the
   Worker wiring lives in index.js.
============================================================ */

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

/* ============================================================
   THE PDF

   Hand-rolled, zero dependencies (spec §2): Workers cannot take a
   native PDF library, and a header + line table + total does not need
   one. Everything visible is built from two primitives — text() and
   rule() — so the owner's layout changes are a change to this one
   function, not a rewrite (spec §5.2).

   Deliberate choices:
   - Content streams are NOT compressed. A few KB either way, and it
     keeps the output greppable when verifying.
   - Base-14 fonts only, WinAnsiEncoding. 'È' is 0xC8 and renders;
     anything above 255 has no glyph and becomes '?'. The naira sign
     never reaches here — money() prints "NGN ".
   - Object numbers are reserved lazily and the xref is built from the
     final byte offsets, so adding an object can never desync the table.
============================================================ */

const PAGE_W = 595, PAGE_H = 842;          // A4, points
const MARGIN = 48;
const ROW_H = 18;
const FONT_R = 'F1', FONT_B = 'F2';        // Helvetica / Helvetica-Bold

// Column edges. The three money columns are right-aligned to these.
const COL_NO = MARGIN;
const COL_DESC = MARGIN + 24;
const COL_QTY_R = 400;
const COL_UNIT_R = 480;
const COL_AMT_R = PAGE_W - MARGIN;

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

// A PDF literal string: escape \ ( ) and clamp to Latin-1. Anything
// outside printable ASCII / Latin-1 has no glyph in a base-14 font.
function pdfString(s) {
  return '(' + String(s)
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?') + ')';
}

// Approximate Helvetica advance widths, used only to right-align and to
// truncate. Exact AFM metrics would be 200 numbers for a few points of
// alignment; these three classes are within a hair for the strings we
// actually print (digits, "NGN 1,000", descriptions).
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

// Trims a description to a column width. '..' rather than '…' because
// the ellipsis is outside the printable range pdfString keeps.
function fit(str, size, maxW) {
  let s = String(str);
  if (textWidth(s, size) <= maxW) return s;
  while (s.length > 1 && textWidth(s + '..', size) > maxW) s = s.slice(0, -1);
  return s + '..';
}

// One byte per char, matching the declared WinAnsiEncoding. The xref
// offsets are byte offsets, so this must agree with the assembler.
function latin1(str) {
  return Uint8Array.from(String(str), ch => ch.charCodeAt(0) & 0xff);
}

export function renderInvoice(order) {
  const o = order || {};
  const lines = parseStoredLines(o);

  const pages = [];
  let ops = null;
  let y = 0;

  const newPage = () => { ops = []; pages.push(ops); y = PAGE_H - MARGIN; };
  const put = (s) => ops.push(s);
  const text = (x, yy, str, font, size) =>
    put(`BT /${font} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${pdfString(str)} Tj ET`);
  const right = (xr, yy, str, font, size) => text(xr - textWidth(str, size), yy, str, font, size);
  const rule = (yy) => put(`0.6 w ${MARGIN} ${yy.toFixed(2)} m ${COL_AMT_R} ${yy.toFixed(2)} l S`);

  const tableHead = () => {
    text(COL_NO, y, '#', FONT_B, 8);
    text(COL_DESC, y, 'DESCRIPTION', FONT_B, 8);
    right(COL_QTY_R, y, 'QTY', FONT_B, 8);
    right(COL_UNIT_R, y, 'UNIT', FONT_B, 8);
    right(COL_AMT_R, y, 'AMOUNT', FONT_B, 8);
    y -= 6; rule(y); y -= 14;
  };

  const header = (first) => {
    if (first) {
      text(MARGIN, y, 'LA CRÈME', FONT_B, 22);
      text(MARGIN, y - 14, 'Bespoke cakes, finger foods & catering', FONT_R, 9);
      right(COL_AMT_R, y, 'INVOICE', FONT_B, 14);
      right(COL_AMT_R, y - 16, `No. ${o.order_number || ''}`, FONT_R, 9);
      right(COL_AMT_R, y - 28, `Issued ${fmtDate(o.received_at)}`, FONT_R, 9);
      // First correction is v2 (spec §5.1).
      if (Number(o.revised) > 0) {
        right(COL_AMT_R, y - 40, `REVISED v${Number(o.revised) + 1}`, FONT_B, 9);
      }
      y -= 56; rule(y); y -= 18;

      text(MARGIN, y, String(o.name || 'Customer'), FONT_B, 10); y -= 14;
      if (o.phone) { text(MARGIN, y, `Phone: ${o.phone}`, FONT_R, 9); y -= 12; }
      const del = [o.delivery, o.address].filter(Boolean).join(': ');
      if (del) { text(MARGIN, y, fit(del, 9, COL_AMT_R - MARGIN), FONT_R, 9); y -= 12; }
      if (o.date_needed) { text(MARGIN, y, `Needed: ${o.date_needed}`, FONT_R, 9); y -= 12; }
      y -= 6; rule(y); y -= 18;
    } else {
      text(MARGIN, y, 'LA CRÈME', FONT_B, 12);
      right(COL_AMT_R, y, `Invoice ${o.order_number || ''} (continued)`, FONT_R, 9);
      y -= 10; rule(y); y -= 18;
    }
    tableHead();
  };

  newPage();
  header(true);

  const BOTTOM = MARGIN + 46;   // keep clear of the footer
  let total = 0, anyUnpriced = false;

  if (!lines.length) {
    text(COL_DESC, y, '(no line items recorded)', FONT_R, 9);
    y -= ROW_H;
  }

  lines.forEach((l, i) => {
    if (y < BOTTOM) { newPage(); header(false); }
    const amt = l.p === null ? null : l.q * l.p;
    if (amt === null) anyUnpriced = true; else total += amt;
    text(COL_NO, y, String(i + 1), FONT_R, 9);
    text(COL_DESC, y, fit(l.d, 9, COL_QTY_R - COL_DESC - 60), FONT_R, 9);
    right(COL_QTY_R, y, String(l.q), FONT_R, 9);
    right(COL_UNIT_R, y, l.p === null ? '-' : money(l.p), FONT_R, 9);
    right(COL_AMT_R, y, amt === null ? 'Price via WhatsApp' : money(amt), FONT_R, 9);
    y -= ROW_H;
  });

  if (y < BOTTOM + 30) { newPage(); header(false); }
  y -= 4; rule(y); y -= 16;
  right(COL_UNIT_R, y, 'TOTAL', FONT_B, 10);
  // Nothing priced at all (a cake-only order) must not read as "NGN 0" —
  // that looks like a free cake. Say what the cart says instead.
  const nothingPriced = anyUnpriced && total === 0;
  right(COL_AMT_R, y, nothingPriced ? 'Price via WhatsApp' : money(total), FONT_B, 10);
  if (anyUnpriced && !nothingPriced) {
    y -= 12;
    right(COL_AMT_R, y, '(excluding items priced on WhatsApp)', FONT_R, 8);
  }

  // Footer goes on every page, after the page count is known.
  pages.forEach((p, i) => {
    const msg = 'Thank you for choosing La Crème';
    p.push(`BT /${FONT_R} 8 Tf ${((PAGE_W - textWidth(msg, 8)) / 2).toFixed(2)} ${MARGIN} Td ${pdfString(msg)} Tj ET`);
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
  const contentIds = pages.map(() => reserve());

  setObj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  setObj(pagesId,
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  setObj(fontRId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  setObj(fontBId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  pages.forEach((p, i) => {
    const content = p.join('\n');
    setObj(contentIds[i], `<< /Length ${latin1(content).length} >>\nstream\n${content}\nendstream`);
    setObj(pageIds[i],
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fontRId} 0 R /F2 ${fontBId} 0 R >> >> ` +
      `/Contents ${contentIds[i]} 0 R >>`);
  });

  const chunks = [];
  let offset = 0;
  const push = (str) => { const b = latin1(str); chunks.push(b); offset += b.length; };

  push('%PDF-1.4\n');
  const offsets = [];
  for (let i = 0; i < objs.length; i++) {
    offsets[i] = offset;
    push(`${i + 1} 0 obj\n${objs[i]}\nendobj\n`);
  }
  const xrefStart = offset;
  push(`xref\n0 ${objs.length + 1}\n`);
  push('0000000000 65535 f \n');
  for (const off of offsets) push(String(off).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(offset);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
