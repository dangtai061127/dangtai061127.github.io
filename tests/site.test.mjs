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
  if (!FULL) assert.match(h, /\+\d+ more/);
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
  assert.equal(c.match(/pattern: \['\^https:\/\/'/g)?.length, 6);
  const email = new RegExp(c.match(/name: email[^\n]*pattern: \['([^']+)'/)[1]);
  assert.ok(email.test('sam@site.com'));
  assert.ok(!email.test('mailto:x@y'));
});
test('a post with an empty body still builds', { skip: !FULL }, () => {
  assert.match(page('blog/empty-body/index.html'), /1 min read/);
});

test('neon case palette is defined', () => {
  const c = css();
  assert.match(c, /--a2:#8b5cf6/i);
  assert.match(c, /--a3:#f0468f/i);
});
test('platform profiles are buttons', () => {
  assert.match(page('index.html'), /class="pbtn"[^>]*href="https:\/\/github\.com\/dangtai061127"/);
  assert.match(page('about/index.html'), /class="pbtn"/);
  const c = readFileSync('public/admin/config.yml', 'utf8');
  assert.match(c, /name: hackthebox/);
  assert.match(c, /name: cyberdefenders/);
  if (FULL) for (const p of ['index.html', 'about/index.html']) {
    assert.match(page(p), /class="pbtn"[^>]*href="https:\/\/app\.hackthebox\.com\/x"/);
    assert.match(page(p), /class="pbtn"[^>]*href="https:\/\/cyberdefenders\.org\/x"/);
  }
});
test('writeups share one tag scheme and show their tags', () => {
  const list = page('writeups/index.html');
  for (const t of ['Log analysis', 'Malware analysis', 'Digital forensics']) assert.match(list, new RegExp(`<span class="chip[^>]*>${t}<`));
  // the full build's long-title fixture pushes Hollow Chapter off the home page
  if (!FULL) assert.match(page('index.html'), /<span class="chip[^>]*>Malware analysis</);
});
test('difficulty has a colored label', () => {
  assert.match(page('writeups/index.html'), /class="diff hard"/);
  assert.match(page('writeups/sample-writeup/index.html'), /class="diff hard"/);
  if (!FULL) assert.match(page('index.html'), /class="diff hard"/);
});
test('theme images appear on cards and article banners', { skip: FULL }, () => {
  const h = page('index.html');
  assert.match(h, /<img[^>]*storage\/labs\/77f1b838/);
  assert.match(h, /<img[^>]*storage\/labs\/744b7fa5/);
  assert.match(page('writeups/inherited/index.html'), /<img class="banner"[^>]*storage\/labs\/77f1b838/);
  assert.doesNotMatch(page('blog/hello/index.html'), /class="banner"/);
});
