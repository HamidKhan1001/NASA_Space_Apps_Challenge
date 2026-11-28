import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const schema = createRequire(import.meta.url)('../../site/js/services/schema.js');

test('real data passes the boundary schema', () => {
  assert.ok(schema.meta(JSON.parse(readFileSync('data/meta.json', 'utf8'))));
  assert.ok(schema.featureCollection(JSON.parse(readFileSync('data/districts.geojson', 'utf8'))));
});
test('malformed payloads are rejected', () => {
  assert.throws(() => schema.meta(null));
  assert.throws(() => schema.meta({ generated_at: 'x', dekads: [] }));
  assert.throws(() => schema.featureCollection({ type: 'Feature' }));
  assert.throws(() => schema.series({}));
});
