#!/usr/bin/env node
/* Zero-dependency static server for local preview and e2e tests. Mirrors the
   production policy: security headers, path-traversal protection, and a per-IP
   token-bucket rate limit that answers 429 with Retry-After.
   Usage: node scripts/static-server.mjs [dir] [port]   (env RATE_LIMIT=req/s, RATE_BURST) */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json', '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

export function createRateLimiter({ ratePerSec, burst, now = Date.now }) {
  const buckets = new Map();
  return function take(key) {
    const t = now();
    const b = buckets.get(key) || { tokens: burst, at: t };
    b.tokens = Math.min(burst, b.tokens + ((t - b.at) / 1000) * ratePerSec);
    b.at = t;
    buckets.set(key, b);
    if (b.tokens >= 1) { b.tokens -= 1; return { ok: true }; }
    return { ok: false, retryAfter: Math.ceil((1 - b.tokens) / ratePerSec) };
  };
}

export function createServer({ root, ratePerSec = 0, burst = 0, now } = {}) {
  const base = resolve(root);
  const limiter = ratePerSec > 0 ? createRateLimiter({ ratePerSec, burst: burst || ratePerSec * 2, now }) : null;
  return http.createServer(async (req, res) => {
    const send = (code, body, extra = {}) => { res.writeHead(code, { ...SECURITY_HEADERS, ...extra }); res.end(body); };
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
      if (limiter) {
        const r = limiter(req.socket.remoteAddress || 'unknown');
        if (!r.ok) return send(429, 'Too Many Requests', { 'Retry-After': String(r.retryAfter) });
      }
      let path;
      try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(400, 'Bad Request'); }
      if (path.includes('\0')) return send(400, 'Bad Request');
      let file = resolve(join(base, path));
      if (file !== base && !file.startsWith(base + sep)) return send(403, 'Forbidden');
      const s = await stat(file).catch(() => null);
      if (s && s.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file).catch(() => null);
      if (!body) return send(404, 'Not Found');
      send(200, req.method === 'HEAD' ? undefined : body, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    } catch (e) {
      send(500, 'Internal Server Error');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || '_site';
  const port = Number(process.argv[3] || 4173);
  const rate = Number(process.env.RATE_LIMIT || 0);
  createServer({ root, ratePerSec: rate, burst: Number(process.env.RATE_BURST || 0) })
    .listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
}
