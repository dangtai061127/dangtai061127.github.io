import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const page = p => readFileSync(`dist/${p}`, 'utf8');
const FULL = process.env.FULL === '1';

test('goatcounter URL is well formed', () => {
  assert.doesNotMatch(page('index.html'), /https:\/\/https:/);
});
test('cms exposes profile and featured', () => {
  const c = readFileSync('public/admin/config.yml', 'utf8');
  assert.match(c, /file: src\/data\/profile\.json/);
  assert.match(c, /name: featured/);
});
