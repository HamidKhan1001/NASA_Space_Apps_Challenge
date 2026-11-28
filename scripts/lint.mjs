#!/usr/bin/env node
/* Repo hygiene without dependencies: JS syntax, JSON validity, i18n key parity,
   and "every script/link the pages reference exists". */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';

const errors = [];
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

for (const f of walk('site/js').filter((p) => p.endsWith('.js') && !p.includes('data-snapshot'))) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { errors.push(`syntax ${f}: ${e.stderr}`); }
}
for (const f of ['site/strings.json', 'site/guide.json', 'data/meta.json', 'pipeline/thresholds.json']) {
  try { JSON.parse(readFileSync(f, 'utf8')); } catch (e) { errors.push(`json ${f}: ${e.message}`); }
}
const strings = JSON.parse(readFileSync('site/strings.json', 'utf8'));
const en = Object.keys(strings.en);
for (const lang of ['ur', 'ps']) {
  const k = Object.keys(strings[lang]);
  const missing = en.filter((x) => !k.includes(x)), extra = k.filter((x) => !en.includes(x));
  if (missing.length) errors.push(`strings.${lang} missing: ${missing.join(', ')}`);
  if (extra.length) errors.push(`strings.${lang} extra: ${extra.join(', ')}`);
}
for (const page of walk('site').filter((p) => p.endsWith('.html'))) {
  const html = readFileSync(page, 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"]*)?"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|data:)/.test(u) || u === './') continue;
    try { statSync(join(dirname(page), u)); } catch { errors.push(`${page}: missing ${u}`); }
  }
  if (!html.includes('Content-Security-Policy')) errors.push(`${page}: no CSP meta tag`);
  for (const m of html.matchAll(/<script[^>]+src="https?:[^>]*>/g)) if (!/integrity=/.test(m[0])) errors.push(`${page}: external script without SRI: ${m[0].slice(0, 80)}`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('lint ok');
