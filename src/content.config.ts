import { defineCollection } from 'astro:content';
// Astro 7 里从 'astro:content' 导入 z 已被标记 deprecated，
// 正确来源是 'astro/zod'（转发 zod v4）。
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    pubDate: z.coerce.date(),
    lang: z.enum(['zh', 'en']),
    tags: z.array(z.string()).default([]),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    translationKey: z.string().optional(),
  }),
});

export const collections = { posts };
