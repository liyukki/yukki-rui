import type { APIContext } from 'astro';
import { createFeed } from '../lib/feed';

/**
 * RSS 的排序契约是纯时间倒序；首页的精选置顶不能泄漏到订阅源。
 * 复用 feed.ts 的全文渲染，只在路由边界重排 item，避免复制一套渲染管线。
 */
async function byDateOnly(response: Response): Promise<Response> {
  const xml = await response.text();
  const pattern = /<item>[\s\S]*?<\/item>/g;
  const items = [...xml.matchAll(pattern)].map((match, index) => {
    const date = /<pubDate>([^<]+)<\/pubDate>/.exec(match[0])?.[1];
    return { xml: match[0], index, time: date ? Date.parse(date) : Number.NaN };
  });
  items.sort((a, b) => b.time - a.time || a.index - b.index);

  let cursor = 0;
  const sortedXml = xml.replace(pattern, () => items[cursor++].xml);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(sortedXml, { status: response.status, headers });
}

export async function createChronologicalFeed(lang: 'zh' | 'en', site?: string): Promise<Response> {
  return byDateOnly(await createFeed(lang, site));
}

export function GET(context: APIContext): Promise<Response> {
  return createChronologicalFeed('zh', context.site?.href);
}
