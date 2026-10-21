import type { APIContext } from 'astro';
import { createChronologicalFeed } from './rss.xml';

export function GET(context: APIContext): Promise<Response> {
  return createChronologicalFeed('en', context.site?.href);
}
