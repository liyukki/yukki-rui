import type { APIContext } from 'astro';
import { createFeed } from '../lib/feed';

export function GET(context: APIContext): Promise<Response> {
  return createFeed('en', context.site?.href);
}
