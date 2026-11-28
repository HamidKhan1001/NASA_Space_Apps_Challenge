import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, createRateLimiter } from '../../scripts/static-server.mjs';

async function boot(opts) {
  const s = createServer({ root: 'site', ...opts });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { s, url: `http://127.0.0.1:${s.address().port}` };
}

test('serves files with security headers', async () => {
  const { s, url } = await boot();
  const r = await fetch(url + '/index.html');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  s.close();
});

test('blocks path traversal and non-GET methods', async () => {
  const { s, url } = await boot();
  const raw = (path) => new Promise((resolve) => {
    import('node:http').then(({ default: h }) => h.get({ host: '127.0.0.1', port: s.address().port, path }, (r) => { r.resume(); resolve(r.statusCode); }));
  });
  assert.ok([400, 403, 404].includes(await raw('/..%2f..%2fpackage.json')));
  assert.notEqual(await raw('/%2e%2e/package.json'), 200);
  assert.equal((await fetch(url + '/index.html', { method: 'POST' })).status, 405);
  s.close();
});

test('rate limiter answers 429 with Retry-After once the burst is spent', async () => {
  const { s, url } = await boot({ ratePerSec: 1, burst: 2, now: () => 0 });
  const codes = [];
  let last;
  for (let i = 0; i < 4; i++) { last = await fetch(url + '/index.html'); codes.push(last.status); }
  assert.deepEqual(codes, [200, 200, 429, 429]);
  assert.ok(Number(last.headers.get('retry-after')) >= 1);
  s.close();
});

test('token bucket refills over time', () => {
  let t = 0;
  const take = createRateLimiter({ ratePerSec: 1, burst: 1, now: () => t });
  assert.equal(take('a').ok, true);
  assert.equal(take('a').ok, false);
  assert.equal(take('b').ok, true, 'buckets are per client');
  t = 1000;
  assert.equal(take('a').ok, true);
});
