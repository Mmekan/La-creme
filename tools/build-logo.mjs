#!/usr/bin/env node
/* ============================================================
   Generates worker/logo-data.js from img/logo-crest.jpg.

   The Worker cannot read files from disk, so the bytes ship as a
   module. A baseline JPEG needs no decoding at all — the PDF embeds
   it verbatim as a /DCTDecode stream — which is why the source must
   be baseline. A progressive JPEG renders blank in some viewers, so
   that case is a hard error rather than a silent bad invoice.

   Run:  node tools/build-logo.mjs
============================================================ */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const SRC = resolve(root, 'img/logo-crest.jpg');
const OUT = resolve(root, 'worker/logo-data.js');

// Walks the JPEG marker chain to the Start-Of-Frame, which is the only
// place width/height/components/progressive live.
function jpegInfo(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG (no SOI marker)');
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    const SOF = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf];
    if (SOF.includes(m)) {
      return {
        height: buf.readUInt16BE(i + 5),
        width: buf.readUInt16BE(i + 7),
        components: buf[i + 9],
        progressive: [0xc2, 0xc6, 0xca, 0xce].includes(m),
      };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no SOF marker found');
}

const buf = readFileSync(SRC);
const info = jpegInfo(buf);

if (info.progressive) {
  throw new Error('progressive JPEG — re-export as baseline before building');
}
if (info.components !== 3) {
  throw new Error(`expected 3 colour components (YCbCr), got ${info.components}`);
}

const out = `// GENERATED FILE — do not edit by hand.
// Source: img/logo-crest.jpg (${info.width}x${info.height}, baseline JPEG)
// Regenerate: node tools/build-logo.mjs
//
// Embedded verbatim in the PDF as a /DCTDecode stream, so nothing decodes
// these pixels. JPEG carries no alpha, which is why the renderer draws the
// logo only on white areas.

export const LOGO = {
  width: ${info.width},
  height: ${info.height},
  jpeg: '${buf.toString('base64')}',
};
`;

writeFileSync(OUT, out);
console.log(`wrote worker/logo-data.js — ${info.width}x${info.height}, ${buf.length} bytes JPEG`);