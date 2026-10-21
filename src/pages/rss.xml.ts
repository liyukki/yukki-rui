import type { APIContext } from 'astro';
import { createFeed } from '../lib/feed';

/** 中英订阅源共用同一套全文渲染；顺序由 createFeed() 内部的日期序保证。 */
export async function createChronologicalFeed(lang: 'zh' | 'en', site?: string): Promise<Response> {
  return createFeed(lang, site);
}

export function GET(context: APIContext): Promise<Response> {
  return createChronologicalFeed('zh', context.site?.href);
}
