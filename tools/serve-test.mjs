/* Serves the real site for tools/test-browser.mjs, with config.js pointed
   at a local Worker. Nothing in the repo is modified — the override is
   appended to the response only.

   Run: node tools/serve-test.mjs
        PORT=8898 WORKER=http://127.0.0.1:8799 node tools/serve-test.mjs
   (the second form is the "catalogue endpoint is down" scenario)
*/
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8899);
const WORKER = process.env.WORKER || 'http://127.0.0.1:8792';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    let body = await readFile(file);
    if (rel === '/config.js') {
      body = Buffer.concat([body, Buffer.from(`\nCONFIG.ordersApi = '${WORKER}';\n`)]);
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`site on ${PORT} -> ${WORKER}`));
