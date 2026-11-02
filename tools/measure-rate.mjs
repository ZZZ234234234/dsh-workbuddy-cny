// Calibrate ¥/credit from a closed measurement window.
//
// Window definition: the credit balance before any workbuddy turn ran, versus
// the balance now. Every workbuddy call in that window is in the session log,
// so DeepSeek's official CNY price for those exact tokens gives the
// replacement value of the credits that were consumed.
//
// Usage:
//   node tools/measure-rate.mjs <session.v4.jsonl.zstd> [dsh-port]
//
// The port is only needed for the current balance; DSH picks a new one on every
// restart, so pass whatever `echo $DSH_WEB_URL` reports.
import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

const [sessionFile, portArg] = process.argv.slice(2);
if (sessionFile === undefined) {
  console.error('usage: node tools/measure-rate.mjs <session.v4.jsonl.zstd> [dsh-port]');
  console.error('  session logs: ~/.dsh/sessions/<workspace>/session-<id>/session.v4.jsonl.zstd');
  process.exit(2);
}

// Default port comes from the environment DSH exports into its own shells.
const PORT =
  portArg ??
  (process.env.DSH_WEB_URL ? new URL(process.env.DSH_WEB_URL).port : '49195');

// The balance at the start of the window. Set this to whatever the credits read
// before the first workbuddy turn of the session you are measuring.
const START_CREDITS = Number(process.env.START_CREDITS ?? 2068.88000083);

// DeepSeek official CNY per 1M tokens, deepseek-flash (api-docs.deepseek.com).
const DS = {
  offPeak: { hit: 0.02, miss: 1, out: 4 },
  peak: { hit: 0.04, miss: 2, out: 8 },
};

// --- tokens of workbuddy turns in this session -----------------------------
const buf = readFileSync(sessionFile);
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const starts = [];
for (let i = 0; i + 4 <= buf.length; i++) {
  if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) starts.push(i);
}
let text = '';
for (let k = 0; k < starts.length; k++) {
  const end = k + 1 < starts.length ? starts[k + 1] : buf.length;
  try { text += zstdDecompressSync(buf.subarray(starts[k], end)).toString('utf8'); } catch { }
}
const usage = { input: 0, cacheRead: 0, output: 0, calls: 0 };
for (const line of text.split('\n')) {
  if (!line || !line.includes('"workbuddy"')) continue;
  const u = /"usage"\s*:\s*\{([^}]*)\}/.exec(line);
  if (!u) continue;
  const o = {};
  for (const part of u[1].split(',')) {
    const [k, v] = part.split(':');
    if (k) o[k.trim().replace(/"/g, '')] = Number(v);
  }
  if (!Number.isFinite(o.inputTokens)) continue;
  usage.input += o.inputTokens ?? 0;
  usage.cacheRead += o.cacheReadTokens ?? 0;
  usage.output += o.outputTokens ?? 0;
  usage.calls += 1;
}

const cost = (rates) =>
  (usage.cacheRead / 1e6) * rates.hit + (usage.input / 1e6) * rates.miss + (usage.output / 1e6) * rates.out;

const cnyOff = cost(DS.offPeak);
const cnyPeak = cost(DS.peak);

// --- credit delta -----------------------------------------------------------
let now = null;
try {
  const r = await fetch(`http://127.0.0.1:${PORT}/plugins/dsh-connect-workbuddy/usage?region=cn`);
  now = (await r.json())?.credits?.total ?? null;
} catch { }

const spent = now === null ? null : START_CREDITS - now;

console.log('=== window ===');
console.log(`workbuddy calls      : ${usage.calls}`);
console.log(`tokens               : in=${usage.input} cacheRead=${usage.cacheRead} out=${usage.output}`);
console.log(`credits at window start: ${START_CREDITS.toFixed(2)}`);
console.log(`credits now            : ${now === null ? 'unreadable' : now.toFixed(2)}`);
console.log(`credits spent          : ${spent === null ? '?' : spent.toFixed(2)}`);
console.log('');
console.log('=== same work priced on DeepSeek (deepseek-flash) ===');
console.log(`off-peak             : ¥${cnyOff.toFixed(4)}`);
console.log(`peak                 : ¥${cnyPeak.toFixed(4)}`);
console.log('');
console.log('=== implied conversion ===');
if (spent && spent > 0) {
  console.log(`¥ per credit (off-peak) : ¥${(cnyOff / spent).toFixed(5)}`);
  console.log(`¥ per credit (peak)     : ¥${(cnyPeak / spent).toFixed(5)}`);
}
