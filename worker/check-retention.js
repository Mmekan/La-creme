// Hand-run guard for retentionSweep's destructive WHERE. Not a test suite
// (CLAUDE.md forbids one) and not wired into anything — run manually:
//   node worker/check-retention.js [path-to-index.js]
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, 'index.js');
const src = fs.readFileSync(file, 'utf8');
const start = src.indexOf('async function retentionSweep');
if (start === -1) { console.error('FAIL: retentionSweep not found in ' + file); process.exit(1); }
const next = src.slice(start + 1).match(/^(async function|export default)/m);
const body = next ? src.slice(start, start + 1 + next.index) : src.slice(start);
const checks = [
  ["status IN ('Rejected','Failed')", body.includes("status IN ('Rejected','Failed')")],
  ["no 'Approved'", !body.includes("'Approved'")],
  ["no 'Pending'", !body.includes("'Pending'")],
  ["received_at < cutoff", body.includes('received_at <')],
  ["LIMIT 200", body.includes('LIMIT 200')],
];
let ok = true;
for (const [label, pass] of checks) {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label);
  ok = ok && pass;
}
if (!ok) { console.error('retentionSweep guard failed — deletion set may be wider than Rejected/Failed.'); process.exit(1); }
console.log('OK');
