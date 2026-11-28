import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, render, TITLE_RE } from '../../scripts/pr-check.mjs';

const f = (filename, extra = {}) => ({ filename, status: 'modified', additions: 5, deletions: 1, patch: '', ...extra });
const base = { title: 'feat(site): add thing', body: 'Adds a thing. Tested with unit tests and e2e.', author: 'dev' };

test('title convention', () => {
  assert.ok(TITLE_RE.test('fix(http): retry on 503'));
  assert.ok(!TITLE_RE.test('updated stuff'));
  assert.equal(evaluate({ ...base, title: 'wip', files: [f('site/js/a.js'), f('tests/a.js')] }).ok, false);
});
test('clean PR passes', () => assert.equal(evaluate({ ...base, files: [f('site/js/a.js'), f('tests/unit/a.js')] }).ok, true));
test('data/ edits need the label or the bot', () => {
  assert.equal(evaluate({ ...base, files: [f('data/meta.json')] }).ok, false);
  assert.equal(evaluate({ ...base, labels: ['data-update'], files: [f('data/meta.json')] }).ok, true);
  assert.equal(evaluate({ ...base, author: 'atlas-bot', files: [f('data/meta.json')] }).ok, true);
});
test('secrets in added lines are blocked, removed lines are not', () => {
  const key = 'ghp_' + 'a'.repeat(36);
  assert.equal(evaluate({ ...base, files: [f('x.js', { patch: `+const t="${key}"` })] }).ok, false);
  assert.equal(evaluate({ ...base, files: [f('x.js', { patch: `-const t="${key}"` }), f('tests/a.js')] }).ok, true);
  assert.equal(evaluate({ ...base, files: [f('pipeline/ee-key.json')] }).ok, false);
  assert.equal(evaluate({ ...base, files: [f('a.json', { patch: '+"private_key": "-----BEGIN PRIVATE KEY-----' })] }).ok, false);
});
test('warns on untested site code and workflow changes; labels by area and size', () => {
  const r = evaluate({ ...base, files: [f('site/js/a.js'), f('.github/workflows/ci.yml')] });
  assert.ok(r.warn.length >= 2);
  assert.ok(r.labels.includes('area:site') && r.labels.includes('area:ci') && r.labels.includes('size:XS'));
  assert.match(render(r), /<!-- pr-checker -->/);
});
