import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'astro/zod';

/**
 * site 集合的 schema 与 content.config.ts 保持一致（那边无法直接 import：
 * 它 import 'astro:content'，vitest 下不存在这个虚拟模块）。
 * 这里复制一份校验器，至少保证数据文件本身的形状不会悄悄跑偏；
 * 字段改动时需要两边同步，verify:frontend 的 astro check 会兜底类型层面的一致性。
 */
const schema = z.object({
  lang: z.enum(['zh', 'en']),
  hero: z.object({ intro: z.string().optional(), sub: z.string().optional(), note: z.string().optional() }).default({}),
  heroImage: z
    .object({ src: z.string().optional(), width: z.number().optional(), height: z.number().optional() })
    .optional(),
  contact: z
    .object({ text: z.string().optional(), links: z.array(z.object({ label: z.string(), url: z.string() })).default([]) })
    .default({ links: [] }),
  work: z
    .object({
      title: z.string().optional(),
      text: z.string().optional(),
      linkLabel: z.string().optional(),
      linkUrl: z.string().optional(),
      status: z.enum(['WIP', 'LIVE']).optional(),
    })
    .default({}),
  about: z
    .object({ subtitle: z.string().optional(), heading: z.string().optional(), body: z.string().optional(), pending: z.string().optional() })
    .default({}),
});

describe('site 个人资料集合', () => {
  for (const lang of ['zh', 'en'] as const) {
    it(`home.${lang}.json 符合 schema 且 lang 字段与文件名一致`, () => {
      const raw = JSON.parse(readFileSync(join('src/content/site', `home.${lang}.json`), 'utf8'));
      const parsed = schema.parse(raw);
      expect(parsed.lang).toBe(lang);
    });

    it(`home.${lang}.json 的联系方式链接都是 http(s) 地址`, () => {
      const raw = JSON.parse(readFileSync(join('src/content/site', `home.${lang}.json`), 'utf8'));
      for (const link of raw.contact?.links ?? []) {
        expect(link.url).toMatch(/^https?:\/\//);
        expect(link.label.trim()).not.toBe('');
      }
    });

    it(`home.${lang}.json 的形象照配置合法（站内路径 + 正整数宽高）`, () => {
      const raw = JSON.parse(readFileSync(join('src/content/site', `home.${lang}.json`), 'utf8'));
      const src = raw.heroImage?.src;
      if (src) expect(src).toMatch(/^\//); // 必须是站内绝对路径（后台自动生成 /uploads/...）
      for (const key of ['width', 'height']) {
        const value = raw.heroImage?.[key];
        if (value !== undefined) expect(Number.isInteger(value) && value > 0).toBe(true);
      }
    });
  }
});
