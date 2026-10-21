/**
 * 独立页面(现在 / 作品 / 最近在听 / 友链)的内容读取。
 *
 * 清洗规则在 lib/page-items.ts 的纯函数里(有单测),这里只负责从内容集合取文件。
 * 取不到或字段留空时返回空内容,由页面套用 consts.ts 里的兜底文案 ——
 * 后台清空内容不该让构建失败,与 getSiteInfo 是同一个取舍。
 */
import { getEntry } from 'astro:content';
import type { Lang } from '../consts';
import { normalizeItems, type PageItem, type PageKey } from './page-items';

export type { PageItem, PageKey, PageStatus } from './page-items';

export interface PageContent {
  intro?: string;
  updatedAt?: Date;
  items: PageItem[];
}

export async function getPageContent(page: PageKey, lang: Lang): Promise<PageContent> {
  const entry = await getEntry('pages', `${page}.${lang}`);
  if (!entry) return { items: [] };
  const intro = entry.data.intro?.trim();
  return {
    ...(intro ? { intro } : {}),
    ...(entry.data.updatedAt ? { updatedAt: entry.data.updatedAt } : {}),
    items: normalizeItems(entry.data.items),
  };
}

