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

test('nav and footer', () => {
  const h = page('index.html');
  assert.match(h, /href="\/about\/"/);
  assert.match(h, /Chakra\+Petch/);
  assert.doesNotMatch(h, /JetBrains/);
  if (!FULL) assert.doesNotMatch(page('blog/index.html'), /linkedin/i);
});

test('home shows real cases and hides empty sections', () => {
  const h = page('index.html');
  assert.match(h, /Inherited/);
  assert.match(h, /attack\.mitre\.org\/techniques\/T1190/);
  assert.match(h, /\+3/);
  assert.match(h, /\/writeups\/\?tag=SOC%20monitoring/);
  assert.doesNotMatch(h, /\/writeups\/\?tag=Detection/);
  assert.doesNotMatch(h, /DRAFT-MARKER/);
  if (FULL) { assert.match(h, /FULL-MARKER/); assert.match(h, /\/uploads\/cv\.pdf/); }
  else { assert.doesNotMatch(h, /Highlights/); assert.doesNotMatch(h, /Download CV/); }
});

test('about hides empty sections', () => {
  const h = page('about/index.html');
  assert.match(h, /Aspiring SOC \/ DFIR analyst/);
  for (const s of ['Experience', 'Achievements', 'Activities', 'Education', 'Hiring for'])
    FULL ? assert.match(h, new RegExp(s)) : assert.doesNotMatch(h, new RegExp(s));
  if (FULL) assert.match(h, /Verify/);
});
