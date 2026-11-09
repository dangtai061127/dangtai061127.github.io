# Keybearer Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổi site Astro hiện tại sang giao diện Keybearer, thêm trang About, dữ liệu cá nhân sửa qua CMS, cải thiện trang đọc bài và RSS.

**Architecture:** Site vẫn build tĩnh. CSS dùng chung nằm trong `Base.astro`, CSS riêng nằm trong từng trang. Dữ liệu cá nhân là một file JSON được import trực tiếp. Kiểm tra bằng `node:test` trên thư mục `dist/` và một trang harness chạy trong Edge headless.

**Tech Stack:** Astro 5, Sveltia CMS, Node `node:test`, Edge headless.

**Spec:** `docs/superpowers/specs/2026-11-09-keybearer-portfolio-design.md`. CSS và markup tham chiếu: `.superpowers/brainstorm/1166-1794196627/content/keybearer-v3.html`.

## Global Constraints

- Không thêm dependency vào `package.json`.
- Nội dung site bằng tiếng Anh. Không hiển thị thành tích chưa có thật: dữ liệu rỗng thì ẩn phần đó.
- Token: `--bg:#050913; --panel:#0B1427; --line:#1C2D50; --blue:#2F6BFF; --cyan:#2BD4F0; --text:#E7EEFB; --soft:#A7B6D2; --dim:#71829F`.
- Font: Chakra Petch 500/600/700, IBM Plex Sans 400/500, IBM Plex Mono 400/500. Không còn JetBrains Mono.
- Animation tắt khi `prefers-reduced-motion: reduce`. Giữ `:focus-visible`.
- Làm trên nhánh `keybearer-redesign`. Không push; push lên `main` sẽ deploy.

## Review Focus

1. Bài có khối code, bảng hoặc danh sách MITRE dài trên màn hình điện thoại: trang không được tràn ngang (harness, Task 8).
2. Tiêu đề hoặc summary có `& < > "`: `rss.xml` vẫn hợp lệ (Task 7).
3. Writeup vừa `draft: true` vừa `featured: true`: không xuất hiện ở trang chủ, RSS, hoặc bài trước/sau (Task 3, 6, 7).
4. Tag có dấu cách hoặc ký tự lạ trên URL: `?tag=SOC%20monitoring` lọc đúng, `?tag="]<x` không gây lỗi và hiện tất cả (Task 5, 8).
5. Bài ngắn không có heading, bài đầu và cuối danh sách: không có hộp mục lục rỗng hay link bài trước/sau trống (Task 6).

---

### Task 1: Dữ liệu và bộ kiểm tra

**Files:**
- Create: `src/data/profile.json`, `tests/site.test.mjs`, `tests/fixtures/profile.full.json`, `tests/fixtures/draft-featured.md`, `tests/fixtures/rss-fixture.md`
- Modify: `src/content.config.ts:7`, `public/admin/config.yml`, `src/content/writeups/inherited.md:18`, `src/content/writeups/sample-writeup.md:16`, `src/site.ts:2`, `.gitignore`

**Interfaces:**
- Produces: `profile.json` đúng schema trong spec; `data.featured: boolean`; biến môi trường `FULL=1` bật các test của bản build đầy đủ.

- [ ] **Step 1: Tạo nhánh**

Run: `git switch -c keybearer-redesign`
Expected: `Switched to a new branch`

- [ ] **Step 2: Viết test thất bại trong `tests/site.test.mjs`**

```js
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
```

Các task sau thêm test vào cuối file này.

- [ ] **Step 3: Chạy để thấy thất bại**

Run: `npm run build; node --test tests/`
Expected: cả hai test FAIL.

- [ ] **Step 4: Thực hiện thay đổi dữ liệu**

- `profile.json`: giá trị khởi tạo theo spec.
- `content.config.ts`: thêm `featured: z.boolean().default(false)` vào schema writeups.
- `config.yml`: thêm field `featured` (boolean, `required: false`, `default: false`) cho writeups; thêm collection `profile` có `files: [{ name: profile, label: Profile, file: src/data/profile.json, ... }]`, `editor: { preview: false }`, field khớp schema, list đều `required: false`.
- `inherited.md`: `tags: [DFIR, SOC monitoring]`. `sample-writeup.md`: `tags: [DFIR]`.
- `site.ts`: `goatcounter: 'dangtai061127'`.
- `.gitignore`: thêm `.superpowers/`.
- Fixture: `profile.full.json` có mọi trường với chữ `FULL-MARKER` và `cv: "/uploads/cv.pdf"`. `draft-featured.md`: writeup `title: DRAFT-MARKER`, `featured: true`, `draft: true`. `rss-fixture.md`: blog `title: 'Q&A <b> "x"'`, `summary: 'A & B < C'`, `draft: false`.

- [ ] **Step 5: Chạy lại**

Run: `npm run build; node --test tests/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .gitignore docs src tests public/admin/config.yml
git commit -m "Add profile data, featured flag and build checks"
```

### Task 2: Layout chung

**Files:**
- Modify: `src/layouts/Base.astro`
- Test: `tests/site.test.mjs`

**Interfaces:**
- Consumes: `profile.links`, `site.github`.
- Produces: `Base` nhận thêm prop `wide?: boolean` (mặc định false). `<main class="wrap">` có thêm class `wide` khi bật; không bật thì tối đa 800px, bật thì 1200px. Lớp global: `.card` (bọc một `div` con), `.btn`, `.btn.o`, `.h` (`small` + `h2`), `.tag`, `.title`, `.shield` (bọc `img`), `.badge`. Phần tử nền `<div class="bg" aria-hidden="true">` đứng đầu `body`.

- [ ] **Step 1: Thêm test**

```js
test('nav and footer', () => {
  const h = page('index.html');
  assert.match(h, /href="\/about\/"/);
  assert.match(h, /Chakra\+Petch/);
  assert.doesNotMatch(h, /JetBrains/);
  if (!FULL) assert.doesNotMatch(h, /linkedin/i);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npm run build; node --test tests/`
Expected: `nav and footer` FAIL.

- [ ] **Step 3: Sửa `Base.astro`**

Giữ meta, GoatCounter và các style `.chip`, `.post`, `.meta`, `.prose`, đổi sang token mới. Chép CSS lớp dùng chung, `.bg` (gradient và lưới từ `.page`), `.nav`, `.foot` và `clip-path` logo từ mockup. Sửa `aria-current` để `/about/` được đánh dấu. Footer chỉ render link có giá trị; email thành `mailto:`.

- [ ] **Step 4: Chạy lại**

Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -am "Apply Keybearer theme to base layout"`

### Task 3: Trang chủ

**Files:**
- Modify: `src/pages/index.astro`
- Test: `tests/site.test.mjs`

**Interfaces:**
- Consumes: `Base wide`, các lớp global của Task 2, `profile`, collection `writeups`.

- [ ] **Step 1: Thêm test**

```js
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
```

- [ ] **Step 2: Chạy để thấy thất bại**, FAIL ở `Inherited` hoặc `+3`.

- [ ] **Step 3: Viết trang**

Theo spec mục Trang chủ, CSS từ mockup đặt trong `<style>` của trang. Lọc bỏ draft trước khi xét `featured`. Skill có link khi có writeup không draft mang tag đó; URL dùng `encodeURIComponent(tag)`. Đánh số mục theo các mục thực sự hiện.

- [ ] **Step 4: Chạy lại**

Run: `npm run build; node --test tests/`
Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -am "Build Keybearer home page"`

### Task 4: Trang About

**Files:**
- Create: `src/pages/about.astro`
- Test: `tests/site.test.mjs`

**Interfaces:**
- Consumes: như Task 3. Quầng sáng lệch trái bằng `:global(.bg)` trong style của trang.

- [ ] **Step 1: Thêm test**

```js
test('about hides empty sections', () => {
  const h = page('about/index.html');
  assert.match(h, /Aspiring SOC \/ DFIR analyst/);
  for (const s of ['Experience', 'Achievements', 'Activities', 'Education', 'Hiring for'])
    FULL ? assert.match(h, new RegExp(s)) : assert.doesNotMatch(h, new RegExp(s));
  if (FULL) assert.match(h, /Verify/);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**, FAIL với ENOENT.
- [ ] **Step 3: Viết `about.astro`** theo spec mục About và markup mockup.
- [ ] **Step 4: Chạy lại**, PASS.
- [ ] **Step 5: Commit**: `git add src/pages/about.astro tests && git commit -m "Add About page"`

### Task 5: Danh sách bài và lọc theo URL

**Files:**
- Modify: `src/pages/[kind]/index.astro:24-27`
- Test: harness ở Task 8

**Interfaces:**
- Produces: khi tải trang, `?tag=` khớp `button[data-tag]` thì lọc như khi bấm chip.

- [ ] **Step 1: Sửa script**

Tách phần xử lý chọn chip thành `apply(button, on)`, dùng cho cả click và lúc tải trang. Tìm nút bằng cách so sánh `b.dataset.tag === value` trên danh sách nút, **không** ghép giá trị URL vào selector. Sắp lại CSS danh sách nếu cần theo token mới.

- [ ] **Step 2: Kiểm tra**

Run: `npm run build; node --test tests/`
Expected: PASS. Hành vi lọc được kiểm tra ở Task 8.

- [ ] **Step 3: Commit**: `git commit -am "Filter writeups from the tag query"`

### Task 6: Trang bài viết

**Files:**
- Modify: `src/pages/[kind]/[slug].astro`
- Test: `tests/site.test.mjs`

**Interfaces:**
- Consumes: `Base wide`. `getStaticPaths` truyền thêm `prev` và `next` (bài không draft cùng `kind`, sắp theo ngày).
- Produces: phần tử `nav.toc` và `nav.pager`, chỉ render khi có dữ liệu.

- [ ] **Step 1: Thêm test**

```js
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
```

- [ ] **Step 2: Chạy để thấy thất bại**, FAIL ở `class="toc"`.
- [ ] **Step 3: Sửa trang**

Thời gian đọc từ `post.body`: `Math.max(1, Math.ceil(words / 200))`, hiển thị `N min read`. Mục lục và nút Copy theo spec; script Copy chạy trên `.prose pre`, chỉ khi có `navigator.clipboard`. Giữ bộ đếm lượt xem và khối `.meta`. Bố cục mục lục dùng grid từ 1100px.

- [ ] **Step 4: Chạy lại**, PASS.
- [ ] **Step 5: Commit**: `git commit -am "Add table of contents, reading time, copy and pager"`

### Task 7: RSS và build đầy đủ

**Files:**
- Create: `src/pages/rss.xml.ts`
- Modify: `src/layouts/Base.astro`
- Test: `tests/site.test.mjs`

**Interfaces:**
- Produces: `GET` trả `application/xml`, tại `/rss.xml`.

- [ ] **Step 1: Thêm test**

```js
test('rss is well formed', () => {
  const x = page('rss.xml');
  assert.match(x, /<rss version="2\.0"/);
  assert.match(x, /https:\/\/dangtai061127\.github\.io\/writeups\/inherited\//);
  assert.doesNotMatch(x, /&(?!amp;|lt;|gt;|quot;|apos;)/);
  assert.doesNotMatch(x, /DRAFT-MARKER/);
  if (FULL) assert.match(x, /Q&amp;A &lt;b&gt;/);
  assert.match(page('index.html'), /type="application\/rss\+xml"/);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**, FAIL với ENOENT.
- [ ] **Step 3: Viết endpoint** và thêm `<link rel="alternate">` trong `Base.astro`, link RSS ở footer.
- [ ] **Step 4: Chạy bản khởi tạo**

Run: `npm run build; node --test tests/`
Expected: PASS.

- [ ] **Step 5: Chạy bản đầy đủ rồi khôi phục**

```bash
cp tests/fixtures/profile.full.json src/data/profile.json
cp tests/fixtures/draft-featured.md src/content/writeups/
cp tests/fixtures/rss-fixture.md src/content/blog/
npm run build; FULL=1 node --test tests/
git checkout src/data/profile.json
rm src/content/writeups/draft-featured.md src/content/blog/rss-fixture.md
```

Expected: PASS. Sau đó `git status --short` không còn fixture trong `src/content`.

- [ ] **Step 6: Commit**: `git add src tests && git commit -m "Add RSS feed"`

### Task 8: Kiểm tra trên trình duyệt

**Files:**
- Create: `tests/overflow.html`

**Interfaces:**
- Consumes: mọi trang đã build. Harness được chép vào `dist/` chỉ khi kiểm tra; CI build lại nên không bị deploy.

- [ ] **Step 1: Viết `tests/overflow.html`**

Lần lượt nạp vào iframe cùng origin rộng `500` và `1280` các đường dẫn `/`, `/about/`, `/writeups/`, `/blog/`, `/writeups/inherited/`, `/writeups/sample-writeup/`, `/blog/hello/`. Với mỗi lần ghi `OK` hoặc `FAIL` (`documentElement.scrollWidth > clientWidth`) vào `body`. Sau đó kiểm tra ở `/writeups/`:
- `?tag=SOC%20monitoring`: đúng 1 `.post` hiện, chip được bật.
- `?tag=%22%5D%3Cx`: mọi `.post` hiện, không có lỗi `error` trên `contentWindow`.

Khi xong ghi dòng `DONE`.

- [ ] **Step 2: Chạy harness**

```bash
npm run build; cp tests/overflow.html dist/
npx astro preview --port 4329 &
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --user-data-dir="$TMP/edge-check" --virtual-time-budget=30000 --dump-dom http://localhost:4329/overflow.html
```

Expected: có `DONE`, không có `FAIL`. Sửa CSS nếu có `FAIL`, rồi chạy lại.

- [ ] **Step 3: Chụp và xem**

Chụp `/`, `/about/`, `/writeups/`, `/writeups/inherited/` ở 1280px và 500px bằng `--screenshot`, so với mockup. Expected: logo không có ô vuông, không có chữ đè nhau.

- [ ] **Step 4: Dừng preview, chạy toàn bộ test**

Run: `npm run build; node --test tests/`
Expected: PASS.

- [ ] **Step 5: Commit**: `git add tests src && git commit -m "Add browser overflow and filter checks"`
