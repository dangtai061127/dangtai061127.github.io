import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { site } from '../site';

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => entities[c]);

export async function GET(ctx: APIContext) {
  const live = (p: any) => !p.data.draft;
  const items = [
    ...(await getCollection('writeups', live)).map((post: any) => ({ post, kind: 'writeups' })),
    ...(await getCollection('blog', live)).map((post: any) => ({ post, kind: 'blog' })),
  ].sort((a, b) => +b.post.data.date - +a.post.data.date);
  const xml = items.map(({ post, kind }) => {
    const url = new URL(`/${kind}/${post.id}/`, ctx.site).href;
    return `<item><title>${esc(post.data.title)}</title><link>${esc(url)}</link><guid>${esc(url)}</guid><pubDate>${post.data.date.toUTCString()}</pubDate><description>${esc(post.data.summary)}</description></item>`;
  }).join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(site.name)}</title><link>${esc(ctx.site!.href)}</link><description>Blue team portfolio, writeups and notes.</description>${xml}</channel></rss>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
