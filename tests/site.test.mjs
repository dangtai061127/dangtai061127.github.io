import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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
  // the full build's long-title fixture is newest, so it takes the big card instead of Inherited
  if (!FULL) assert.match(h, /attack\.mitre\.org\/techniques\/T1190/);
  if (!FULL) assert.match(h, /\+3/);
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

test('article extras', () => {
  const w = page('writeups/inherited/index.html');
  assert.match(w, /class="toc"/);
  assert.match(w, /\d+ min read/);
  assert.match(w, /class="pager"/);
  assert.doesNotMatch(w, /DRAFT-MARKER/);
  const b = page('blog/hello/index.html');
  assert.doesNotMatch(b, /class="toc"/);
  if (!FULL) assert.doesNotMatch(b, /class="pager"/);
});

test('rss is well formed', () => {
  const x = page('rss.xml');
  assert.match(x, /<rss version="2\.0"/);
  assert.match(x, /https:\/\/dangtai061127\.github\.io\/writeups\/inherited\//);
  assert.doesNotMatch(x, /&(?!amp;|lt;|gt;|quot;|apos;)/);
  assert.doesNotMatch(x, /DRAFT-MARKER/);
  if (FULL) assert.match(x, /Q&amp;A &lt;b&gt;/);
  assert.match(page('index.html'), /type="application\/rss\+xml"/);
});

const css = () => [...readdirSync('dist/_astro').filter(f => f.endsWith('.css')).map(f => page(`_astro/${f}`)), page('about/index.html')].join('');

test('posts without metadata print no stray zero', () => {
  assert.doesNotMatch(page('blog/hello/index.html'), /<\/h1>\s*0\s*</);
});
test('clipped controls keep a visible focus ring', () => {
  const c = css();
  assert.match(c, /a\.card:focus-visible>div/);
  assert.match(c, /button\.chip:focus-visible\{outline-offset:-2px/);
  assert.match(c, /\.cta[^{]*\.btn[^{]*:focus-visible[^{]*\{outline-color:#0a1c44/);
});
test('cms rejects links that would break', () => {
  const c = readFileSync('public/admin/config.yml', 'utf8');
  assert.equal(c.match(/pattern: \['\^https:\/\/'/g)?.length, 4);
  const email = new RegExp(c.match(/name: email[^\n]*pattern: \['([^']+)'/)[1]);
  assert.ok(email.test('sam@site.com'));
  assert.ok(!email.test('mailto:x@y'));
});
test('a post with an empty body still builds', { skip: !FULL }, () => {
  assert.match(page('blog/empty-body/index.html'), /1 min read/);
});
