/**
 * 独立页面(现在 / 作品 / 最近在听)的条目清洗规则。
 *
 * 为什么单独一个文件:CMS 里点一下「添加条目」但没填标题、或者只填了链接文字没填地址,
 * 这些半成品都会原样写进 JSON。渲染规则(该丢掉哪些、链接不成对怎么办)放这里就是纯函数,
 * 能被单测直接覆盖 —— 与 lib/hero-image.ts 是同一个套路:碰 astro:content 的读取代码
 * 留在 page-content.ts,规则本身不依赖框架。
 */

export type PageKey = 'now' | 'works' | 'listening';
export type PageStatus = 'WIP' | 'LIVE' | 'PAUSED';

export interface PageItem {
  title: string;
  meta?: string;
  text?: string;
  status?: PageStatus;
  link?: { label: string; url: string };
}

/** 内容文件里的原始条目:字段都可能缺,也可能只有空白。 */
export interface RawPageItem {
  title?: string;
  meta?: string;
  text?: string;
  status?: PageStatus;
  linkLabel?: string;
  linkUrl?: string;
}

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * 把内容文件里的条目清洗成可渲染的列表:
 * - 没有标题的条目直接丢掉(后台里常见的半成品,渲染出来只会是空卡片)
 * - 所有文本去掉首尾空白
 * - 链接必须「文字 + 地址」成对,只有一半就当作没填
 * - 保持文件里的顺序
 */
export function normalizeItems(raw: readonly RawPageItem[] | undefined): PageItem[] {
  const items: PageItem[] = [];
  for (const entry of raw ?? []) {
    const title = clean(entry.title);
    if (!title) continue;
    const label = clean(entry.linkLabel);
    const url = clean(entry.linkUrl);
    const meta = clean(entry.meta);
    const text = clean(entry.text);
    items.push({
      title,
      ...(meta ? { meta } : {}),
      ...(text ? { text } : {}),
      ...(entry.status ? { status: entry.status } : {}),
      ...(label && url ? { link: { label, url } } : {}),
    });
  }
  return items;
}

