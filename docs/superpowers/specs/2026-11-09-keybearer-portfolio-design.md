# Keybearer portfolio redesign: spec

Mockup đã duyệt: `.superpowers/brainstorm/1166-1794196627/content/keybearer-v3.html` (chỉ có trên máy, không commit).

## Mục tiêu

Site `dangtai061127.github.io` phải cho nhà tuyển dụng SOC/DFIR thấy năng lực trong 30 giây đầu và cho người đọc security trải nghiệm đọc bài dài tốt.

Thành công khi: màn hình đầu có lời giới thiệu, nút CV và link mạng xã hội; writeup tiêu biểu hiện ngay dưới hero; About có đủ giới thiệu, kinh nghiệm, thành tựu, hoạt động, học vấn, liên hệ; mọi nội dung cá nhân sửa được qua `/admin`.

## Ràng buộc

- Giữ Astro 5, build tĩnh, GitHub Pages, Sveltia CMS ở `/admin`. Không thêm dependency.
- Nội dung site bằng tiếng Anh.
- Không hiển thị thành tích chưa có thật: dữ liệu rỗng thì ẩn phần đó.
- Không làm: tìm kiếm toàn site, bình luận, song ngữ, thư viện animation.

## Giao diện

- Token: `--bg:#050913; --panel:#0B1427; --line:#1C2D50; --blue:#2F6BFF; --cyan:#2BD4F0; --text:#E7EEFB; --soft:#A7B6D2; --dim:#71829F`.
- Font: Chakra Petch 500/600/700 (tiêu đề, nút), IBM Plex Sans 400/500 (nội dung), IBM Plex Mono 400/500 (nhãn, code). Bỏ JetBrains Mono.
- Logo: `public/logo.png` có nền đục, nên cắt bằng `clip-path: polygon(26.6% 11.8%,73.4% 11.8%,80.8% 18.9%,80.8% 58.4%,50% 88.7%,19.2% 58.4%,19.2% 18.9%)` trên `img`, còn `drop-shadow` đặt ở phần tử cha.
- Thẻ, nút, tiêu đề mục đánh số, vòng xoay, đường mạch hero: theo CSS của mockup.
- Animation tắt khi `prefers-reduced-motion: reduce`. Giữ `:focus-visible`.
- Dưới 860px: một cột, logo lên trước chữ, ẩn vòng xoay và đường mạch, nav vẫn đủ 4 link. Không được tràn ngang.
- Nav: Home `/`, About `/about/`, Writeups `/writeups/`, Blog `/blog/`.
- Footer: GitHub (từ `site.ts`), các link trong `profile.json` có giá trị, RSS.

## Dữ liệu cá nhân

File mới `src/data/profile.json`, import trực tiếp trong trang, sửa qua collection `profile` loại `files` trong `public/admin/config.yml`.

```json
{
  "role": "Aspiring SOC / DFIR analyst",
  "headline": "Every intrusion leaves a trail.",
  "lead": "",
  "intro": "",
  "cv": "",
  "links": { "linkedin": "", "tryhackme": "", "btlo": "", "email": "" },
  "skills": [{ "name": "DFIR", "tag": "DFIR" }],
  "achievements": [{ "title": "", "meta": "", "url": "" }],
  "experience": [{ "period": "", "title": "", "detail": "" }],
  "activities": [{ "kind": "", "title": "", "detail": "" }],
  "education": [{ "title": "", "detail": "" }]
}
```

Giá trị khởi tạo: `role`, `headline`, bốn skill SOC monitoring, Detection, DFIR, Threat intelligence (`tag` trùng `name`), các mảng còn lại rỗng. `cv` là đường dẫn như `/uploads/cv.pdf`. `email` là địa chỉ, site tự thêm `mailto:`.

## Trang

**Trang chủ** (`src/pages/index.astro`): nav, hero (eyebrow, `headline`, `lead`, nút CV, nút "Read the case files", link), 01 Case files, 02 Highlights, 03 Skills, footer.

- Case files: writeup không draft có `featured: true`, mới nhất trước, tối đa 3; không có bài nào thì lấy 3 bài mới nhất.
- Bài đầu là thẻ lớn: platform, category, summary, tối đa 4 ID MITRE (link tới ATT&CK, thừa thì hiện `+N`), tools. Chỉ hiện ID, không hiện tên kỹ thuật.
- Cột phải là các bài còn lại; có ít hơn 3 bài thì thêm thẻ "All case files".
- Highlights: 3 mục đầu của `achievements`; rỗng thì ẩn cả mục.
- Skills: mỗi ô có tên; chỉ hiện "See the work →" tới `/writeups/?tag=<tag>` khi có writeup mang tag đó.

**About** (`src/pages/about.astro`): thẻ danh tính (logo, tên, role, link, CV) và cột nội dung gồm Intro, Experience, Achievements (có "Verify ↗" khi có `url`), Activities, Education, dải "Hiring for a blue team role?" (chỉ hiện khi có email). Mục rỗng thì ẩn và số thứ tự tự dồn lại.

**Danh sách** (`src/pages/[kind]/index.astro`): đổi style theo token mới. Khi tải trang, đọc `?tag=`; nếu tag tồn tại thì bật chip đó và lọc, nếu không thì hiện tất cả.

**Bài viết** (`src/pages/[kind]/[slug].astro`):
- Thời gian đọc: số từ / 200, làm tròn lên, tối thiểu 1 phút.
- Mục lục lấy `headings` độ sâu 2–3 từ `render()`, chỉ hiện khi có từ 2 heading. Từ 1100px đặt bên phải bài, dưới mức đó đặt trên bài.
- Nút Copy trên mỗi `pre`: là `button` có `aria-label`, chỉ thêm khi có `navigator.clipboard`.
- Bài trước/sau trong cùng `kind`, sắp theo ngày.

**RSS** (`src/pages/rss.xml.ts`): RSS 2.0 gộp writeups và blog không draft, mới nhất trước, URL tuyệt đối từ `Astro.site`, escape `& < > " '` ở mọi trường văn bản. Thêm `<link rel="alternate">` vào `Base.astro`.

## Thay đổi khác

- `src/content.config.ts` và `public/admin/config.yml`: writeup thêm `featured` (boolean, mặc định false).
- Thêm tag có thật cho writeup hiện có: Inherited `[DFIR, SOC monitoring]`, Hollow Chapter `[DFIR]`.
- `src/site.ts`: `goatcounter: 'dangtai061127'`.
- `.gitignore`: thêm `.superpowers/`.
- Xoá câu mẫu TODO cũ ở trang chủ.

## Kiểm tra

- `npm run build` thành công.
- Chụp trang chủ, About, danh sách, bài viết bằng Edge headless ở 1280px và 500px; `scrollWidth` không lớn hơn chiều rộng cửa sổ.
- Build với `profile.json` chỉ có giá trị khởi tạo: không có mục rỗng, nút CV hay link trống.
- `dist/rss.xml` parse được bằng XML parser, không chứa bài draft.
- `/writeups/?tag=DFIR` lọc đúng; `?tag=khong-co` hiện tất cả.
