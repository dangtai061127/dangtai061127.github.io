import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
const base = { title: z.string(), date: z.coerce.date(), summary: z.string(), tags: z.array(z.string()).default([]), draft: z.boolean().default(false) };
export const collections = {
  writeups: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/writeups' }),
    schema: z.object({ ...base, platform: z.string().optional(), difficulty: z.string().optional(), category: z.string().optional(), tools: z.array(z.string()).default([]), mitre: z.array(z.string()).default([]) }),
  }),
  blog: defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/blog' }), schema: z.object(base) }),
};
