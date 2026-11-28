import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const http = createRequire(import.meta.url)('../../site/js/services/http.js');

const res = (status, body = '{}', headers = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (k) => headers[k] ?? headers[k.toLowerCase()] ?? null },
  json: async () => JSON.parse(body), text: async () => body
});
const fast = { sleep: async () => {}, random: () => 0 };

test('retries 503 then succeeds', async () => {
  let n = 0;
  const c = http.createClient({ ...fast, fetch: async () => (++n < 3 ? res(503) : res(200, '{"ok":1}')) });
  assert.deepEqual(await c.getJSON('/a'), { ok: 1 });
  assert.equal(n, 3);
});

test('does not retry 404', async () => {
  let n = 0;
  const c = http.createClient({ ...fast, fetch: async () => { n++; return res(404); } });
  await assert.rejects(c.getJSON('/a'), (e) => e.name === 'HttpError' && e.status === 404);
  assert.equal(n, 1);
});

test('429 exhausts retries and throws RateLimitError with Retry-After', async () => {
  let n = 0;
  const c = http.createClient({ ...fast, retries: 2, fetch: async () => { n++; return res(429, '', { 'Retry-After': '7' }); } });
  await assert.rejects(c.getJSON('/a'), (e) => e.name === 'RateLimitError' && e.retryAfterMs === 7000);
  assert.equal(n, 3);
});

test('honours Retry-After (capped) between attempts', async () => {
  const waits = []; let n = 0;
  const c = http.createClient({ fetch: async () => (++n === 1 ? res(429, '', { 'Retry-After': '2' }) : res(200)),
    sleep: async (ms) => { waits.push(ms); }, random: () => 0, burst: 100, ratePerSec: 1000 });
  await c.getJSON('/a');
  assert.deepEqual(waits, [2000]);
  const c2 = http.createClient({ fetch: (() => { let k = 0; return async () => (++k === 1 ? res(503, '', { 'Retry-After': '600' }) : res(200)); })(),
    sleep: async (ms) => { waits.push(ms); }, maxDelayMs: 5000, burst: 100, ratePerSec: 1000 });
  await c2.getJSON('/b');
  assert.equal(waits[1], 5000);
});

test('network errors are retried, then surfaced', async () => {
  let n = 0;
  const c = http.createClient({ ...fast, retries: 1, fetch: async () => { n++; throw new TypeError('network'); } });
  await assert.rejects(c.getJSON('/a'), /network/);
  assert.equal(n, 2);
});

test('timeout aborts a hung request', async () => {
  const c = http.createClient({ ...fast, retries: 0, timeoutMs: 20, fetch: (u, i) => new Promise((_, rej) => i.signal.addEventListener('abort', () => rej(new Error('aborted')))) });
  await assert.rejects(c.getJSON('/slow'), (e) => e.name === 'TimeoutError');
});

test('identical concurrent GETs share one request', async () => {
  let n = 0;
  const c = http.createClient({ ...fast, fetch: async () => { n++; await new Promise((r) => setTimeout(r, 10)); return res(200, '[1]'); } });
  const [a, b] = await Promise.all([c.getJSON('/same'), c.getJSON('/same')]);
  assert.deepEqual(a, b);
  assert.equal(n, 1);
});

test('concurrency never exceeds the cap', async () => {
  let live = 0, peak = 0;
  const c = http.createClient({ ...fast, maxConcurrent: 2, burst: 100, ratePerSec: 1000,
    fetch: async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; return res(200); } });
  await Promise.all(Array.from({ length: 8 }, (_, i) => c.getJSON('/x' + i)));
  assert.equal(peak, 2);
});

test('token bucket delays requests beyond the burst', async () => {
  let t = 0; const waits = [];
  const c = http.createClient({ now: () => t, sleep: async (ms) => { waits.push(ms); t += ms; }, burst: 2, ratePerSec: 10,
    fetch: async () => res(200), maxConcurrent: 1 });
  for (let i = 0; i < 4; i++) await c.getJSON('/r' + i);
  assert.ok(waits.length >= 2 && waits.every((w) => w >= 90), 'waited for tokens: ' + waits);
});

test('path and id validation rejects traversal and foreign origins', () => {
  for (const bad of ['../x', 'a/../b', '/etc/passwd', 'http://evil/x', '//evil/x', 'a\\b', 'javascript:1', '', 'a//b'])
    assert.equal(http.isSafePath(bad), false, bad);
  for (const ok of ['meta.json', 'series/PK.KP.CHA.json', 'ucs/all.geojson']) assert.equal(http.isSafePath(ok), true, ok);
  for (const bad of ['..', 'PK/KP', '<img>', '', 'a'.repeat(65)]) assert.equal(http.isSafeId(bad), false, bad);
  assert.equal(http.isSafeId('PK.KP.CHA'), true);
});

test('parseRetryAfter handles seconds, dates and junk', () => {
  assert.equal(http.parseRetryAfter('3', 0), 3000);
  assert.equal(http.parseRetryAfter(new Date(5000).toUTCString(), 1000), 4000);
  assert.equal(http.parseRetryAfter('soon', 0), null);
  assert.equal(http.parseRetryAfter(null, 0), null);
});
