import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const strings = JSON.parse(readFileSync('site/strings.json', 'utf8'));

test('en, ur and ps define exactly the same keys', () => {
  const en = Object.keys(strings.en).sort();
  for (const l of ['ur', 'ps']) assert.deepEqual(Object.keys(strings[l]).sort(), en, l);
});

test('no translation is an empty string', () => {
  for (const l of ['en', 'ur', 'ps']) for (const [k, v] of Object.entries(strings[l])) assert.ok(String(v).trim(), `${l}.${k}`);
});

test('every district has a series file; a missing deficit is always nodata', () => {
  const fc = JSON.parse(readFileSync('data/districts.geojson', 'utf8'));
  const files = new Set(readdirSync('data/series'));
  for (const f of fc.features) {
    const p = f.properties;
    assert.ok(files.has(p.district_id + '.json'), 'series for ' + p.district_id);
    if (p.deficit_mm == null) assert.equal(p.status, 'nodata', p.district_id + ' has no number so must be nodata, never green');
  }
});
